"""OAuth authorize URL + token exchange."""
from __future__ import annotations

import base64
import secrets
import time
from typing import Any

import httpx

from app.connectors.registry import (
    CONNECTORS,
    build_authorize_url,
    callback_url,
    microsoft_oauth_tenant,
)
from app.connectors.user_store import set_connection

_PENDING_STATES: dict[str, dict[str, Any]] = {}
_STATE_TTL_SEC = 600


def _gc_states() -> None:
    now = time.time()
    expired = [k for k, v in _PENDING_STATES.items() if now - v["created"] > _STATE_TTL_SEC]
    for key in expired:
        _PENDING_STATES.pop(key, None)


def create_authorize_session(connector_id: str, uid: str) -> tuple[str, str]:
    _gc_states()
    state = secrets.token_urlsafe(24)
    _PENDING_STATES[state] = {
        "connector_id": connector_id,
        "uid": uid,
        "created": time.time(),
    }
    url = build_authorize_url(connector_id, state)
    return state, url


def pop_state(state: str) -> tuple[str, str] | None:
    _gc_states()
    entry = _PENDING_STATES.pop(state, None)
    if not entry:
        return None
    return str(entry["connector_id"]), str(entry["uid"])


async def exchange_code(connector_id: str, uid: str, code: str) -> dict[str, Any]:
    spec = CONNECTORS[connector_id]
    if spec.provider == "google":
        tokens = await _exchange_google(code)
        email = await _fetch_google_email(tokens.get("access_token"))
        if email:
            tokens["account_email"] = email
    elif spec.provider == "microsoft":
        tokens = await _exchange_microsoft(code)
        email = await _fetch_microsoft_email(tokens.get("access_token"))
        if email:
            tokens["account_email"] = email
    elif spec.provider == "figma":
        tokens = await _exchange_figma(code)
        profile = await _fetch_figma_profile(tokens.get("access_token"))
        if profile.get("email"):
            tokens["account_email"] = profile["email"]
        if profile.get("handle"):
            tokens["account_name"] = profile["handle"]
    elif spec.provider == "notion":
        tokens = await _exchange_notion(code)
        owner = tokens.pop("owner", None)
        if isinstance(owner, dict):
            user = owner.get("user") or {}
            if isinstance(user, dict) and user.get("email"):
                tokens["account_email"] = str(user["email"])
    else:
        raise ValueError(f"Unsupported provider: {spec.provider}")

    set_connection(uid, connector_id, spec.provider, tokens)
    return tokens


async def _exchange_google(code: str) -> dict[str, Any]:
    import os

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "redirect_uri": callback_url(),
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


async def _fetch_figma_profile(access_token: Any) -> dict[str, Any]:
    if not access_token:
        return {}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://api.figma.com/v1/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if r.status_code != 200:
        return {}
    return r.json()


async def _exchange_notion(code: str) -> dict[str, Any]:
    import os

    client_id = os.getenv("NOTION_CLIENT_ID", "")
    client_secret = os.getenv("NOTION_CLIENT_SECRET", "")
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.notion.com/v1/oauth/token",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/json",
            },
            json={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url(),
            },
        )
        r.raise_for_status()
        data = r.json()
    return {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "workspace_id": data.get("workspace_id"),
        "workspace_name": data.get("workspace_name"),
        "bot_id": data.get("bot_id"),
        "owner": data.get("owner"),
    }


async def _exchange_microsoft(code: str) -> dict[str, Any]:
    import os

    tenant = microsoft_oauth_tenant()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            data={
                "client_id": os.getenv("MICROSOFT_OAUTH_CLIENT_ID", ""),
                "client_secret": os.getenv("MICROSOFT_OAUTH_CLIENT_SECRET", ""),
                "code": code,
                "redirect_uri": callback_url(),
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


async def _exchange_figma(code: str) -> dict[str, Any]:
    import os

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.figma.com/v1/oauth/token",
            data={
                "client_id": os.getenv("FIGMA_CLIENT_ID", ""),
                "client_secret": os.getenv("FIGMA_CLIENT_SECRET", ""),
                "redirect_uri": callback_url(),
                "code": code,
                "grant_type": "authorization_code",
            },
        )
        r.raise_for_status()
        data = r.json()
    return {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_in": data.get("expires_in"),
        "user_id": data.get("user_id_string"),
    }

