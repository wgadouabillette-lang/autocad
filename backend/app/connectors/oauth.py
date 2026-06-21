"""OAuth authorize URL + token exchange."""
from __future__ import annotations

import base64
import time
from typing import Any

import httpx

from app.connectors.registry import (
    CONNECTORS,
    build_authorize_url,
    callback_url,
    microsoft_oauth_tenant,
    resolve_oauth_redirect_base,
)
from app.connectors.oauth_state import issue_oauth_state, parse_oauth_state
from app.connectors.user_store import set_connection

_STATE_TTL_SEC = 600


def create_authorize_session(
    connector_id: str,
    uid: str,
    return_origin: str | None = None,
    return_path: str | None = None,
    request_origin: str | None = None,
) -> tuple[str, str]:
    redirect_base = resolve_oauth_redirect_base(return_origin, request_origin)
    state = issue_oauth_state(
        connector_id=connector_id,
        uid=uid,
        return_origin=return_origin,
        return_path=return_path,
        redirect_base=redirect_base,
    )
    url = build_authorize_url(connector_id, state, redirect_base=redirect_base)
    return state, url


def pop_state(state: str) -> tuple[str, str, str | None, str | None, str | None] | None:
    payload = parse_oauth_state(state)
    if not payload:
        return None
    redirect_base = payload.get("rb")
    return (
        str(payload["c"]),
        str(payload["u"]),
        str(payload["ro"]).strip() if payload.get("ro") else None,
        str(payload["rp"]).strip() if payload.get("rp") else None,
        str(redirect_base).strip() if redirect_base else None,
    )


async def exchange_code(
    connector_id: str,
    uid: str,
    code: str,
    redirect_base: str | None = None,
) -> dict[str, Any]:
    spec = CONNECTORS[connector_id]
    if spec.provider == "google":
        tokens = await _exchange_google(code, redirect_base)
        email = await _fetch_google_email(tokens.get("access_token"))
        if email:
            tokens["account_email"] = email
    elif spec.provider == "microsoft":
        tokens = await _exchange_microsoft(code, redirect_base)
        email = await _fetch_microsoft_email(tokens.get("access_token"))
        if email:
            tokens["account_email"] = email
    elif spec.provider == "spotify":
        tokens = await _exchange_spotify(code, redirect_base)
        profile = await _fetch_spotify_profile(tokens.get("access_token"))
        if profile.get("email"):
            tokens["account_email"] = profile["email"]
        if profile.get("display_name"):
            tokens["account_name"] = profile["display_name"]
    else:
        raise ValueError(f"Unsupported provider: {spec.provider}")

    set_connection(uid, connector_id, spec.provider, tokens)
    return tokens


async def _exchange_google(code: str, redirect_base: str | None = None) -> dict[str, Any]:
    import os

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "redirect_uri": callback_url(redirect_base),
                "grant_type": "authorization_code",
            },
        )
        r.raise_for_status()
        data = r.json()
    return {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
        "token_type": data.get("token_type"),
        "scope": data.get("scope"),
    }


async def _fetch_google_email(access_token: Any) -> str | None:
    if not access_token:
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if r.status_code != 200:
        return None
    email = r.json().get("email")
    return str(email).strip() if email else None


async def _fetch_microsoft_email(access_token: Any) -> str | None:
    if not access_token:
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"$select": "mail,userPrincipalName,displayName"},
        )
    if r.status_code != 200:
        return None
    data = r.json()
    email = data.get("mail") or data.get("userPrincipalName")
    return str(email).strip() if email else None


async def _exchange_microsoft(code: str, redirect_base: str | None = None) -> dict[str, Any]:
    import os

    tenant = microsoft_oauth_tenant()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            data={
                "client_id": os.getenv("MICROSOFT_OAUTH_CLIENT_ID", ""),
                "client_secret": os.getenv("MICROSOFT_OAUTH_CLIENT_SECRET", ""),
                "code": code,
                "redirect_uri": callback_url(redirect_base),
                "grant_type": "authorization_code",
            },
        )
        r.raise_for_status()
        data = r.json()
    return {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
        "token_type": data.get("token_type"),
        "scope": data.get("scope"),
    }


async def _exchange_spotify(code: str, redirect_base: str | None = None) -> dict[str, Any]:
    import os

    client_id = os.getenv("SPOTIFY_CLIENT_ID", "")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "")
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://accounts.spotify.com/api/token",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url(redirect_base),
            },
        )
        r.raise_for_status()
        data = r.json()
    return {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
        "token_type": data.get("token_type"),
        "scope": data.get("scope"),
    }


async def _fetch_spotify_profile(access_token: Any) -> dict[str, Any]:
    if not access_token:
        return {}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if r.status_code != 200:
        return {}
    data = r.json()
    return {
        "email": data.get("email"),
        "display_name": data.get("display_name"),
        "id": data.get("id"),
    }

