"""Refresh and resolve OAuth access tokens for all connector providers."""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

from app.connectors.registry import CONNECTORS, microsoft_oauth_tenant
from app.connectors.user_store import get_connection, remove_connection, set_connection

logger = logging.getLogger(__name__)


def _oauth_refresh_fatal(exc: Exception) -> bool:
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    if exc.response.status_code not in {400, 401, 403}:
        return False
    try:
        payload = exc.response.json()
        err = str(payload.get("error", "")).lower()
        if err in {"invalid_grant", "invalid_client", "unauthorized_client"}:
            return True
    except Exception:
        pass
    return exc.response.status_code in {401, 403}


def _access_token_still_valid(entry: dict[str, Any]) -> bool:
    expires_at = entry.get("expires_at")
    if not isinstance(expires_at, (int, float)):
        return False
    return time.time() < float(expires_at) - 60


async def get_valid_access_token(uid: str, connector_id: str) -> str | None:
    spec = CONNECTORS.get(connector_id)
    if not spec:
        return None
    if spec.provider == "google":
        return await _get_valid_google_token(uid, connector_id)
    if spec.provider == "microsoft":
        return await _get_valid_microsoft_token(uid, connector_id)
    if spec.provider == "spotify":
        return await _get_valid_spotify_token(uid, connector_id)
    return None


def connection_account_label(entry: dict[str, Any] | None) -> str | None:
    if not entry:
        return None
    for key in ("account_email", "account_name", "user_name", "user_id"):
        value = entry.get(key)
        if value:
            return str(value)
    return None


async def _get_valid_google_token(uid: str, connector_id: str) -> str | None:
    entry = get_connection(uid, connector_id)
    if not entry:
        return None

    access_token = entry.get("access_token")
    if not access_token:
        return None

    expires_at = entry.get("expires_at")
    if _access_token_still_valid(entry):
        return str(access_token)

    refresh_token = entry.get("refresh_token")
    if not refresh_token:
        return None

    try:
        refreshed = await _refresh_google(refresh_token)
    except Exception as exc:
        logger.warning(
            "Google token refresh failed for %s/%s: %s",
            uid,
            connector_id,
            _refresh_error_detail(exc),
        )
        if _oauth_refresh_fatal(exc):
            remove_connection(uid, connector_id)
        return None

    merged = _merge_token_entry(entry, refreshed, "google")
    set_connection(uid, connector_id, "google", merged)
    token = merged.get("access_token")
    return str(token) if token else None


async def _get_valid_microsoft_token(uid: str, connector_id: str) -> str | None:
    entry = get_connection(uid, connector_id)
    if not entry:
        return None

    access_token = entry.get("access_token")
    if not access_token:
        return None

    expires_at = entry.get("expires_at")
    if _access_token_still_valid(entry):
        return str(access_token)

    refresh_token = entry.get("refresh_token")
    if not refresh_token:
        return None

    try:
        refreshed = await _refresh_microsoft(refresh_token)
    except Exception as exc:
        logger.warning(
            "Microsoft token refresh failed for %s/%s: %s",
            uid,
            connector_id,
            _refresh_error_detail(exc),
        )
        if _oauth_refresh_fatal(exc):
            remove_connection(uid, connector_id)
        return None

    merged = _merge_token_entry(entry, refreshed, "microsoft")
    set_connection(uid, connector_id, "microsoft", merged)
    token = merged.get("access_token")
    return str(token) if token else None


async def _get_valid_spotify_token(uid: str, connector_id: str) -> str | None:
    entry = get_connection(uid, connector_id)
    if not entry:
        return None

    access_token = entry.get("access_token")
    if not access_token:
        return None

    expires_at = entry.get("expires_at")
    if _access_token_still_valid(entry):
        return str(access_token)

    refresh_token = entry.get("refresh_token")
    if not refresh_token:
        return None

    try:
        refreshed = await _refresh_spotify(refresh_token)
    except Exception as exc:
        logger.warning(
            "Spotify token refresh failed for %s/%s: %s",
            uid,
            connector_id,
            _refresh_error_detail(exc),
        )
        if _oauth_refresh_fatal(exc):
            remove_connection(uid, connector_id)
        return None

    merged = _merge_token_entry(entry, refreshed, "spotify")
    set_connection(uid, connector_id, "spotify", merged)
    token = merged.get("access_token")
    return str(token) if token else None


def _merge_token_entry(entry: dict[str, Any], refreshed: dict[str, Any], provider: str) -> dict[str, Any]:
    access_token = refreshed.get("access_token") or entry.get("access_token")
    merged = {
        **entry,
        "provider": provider,
        "access_token": access_token,
        "expires_in": refreshed.get("expires_in"),
        "token_type": refreshed.get("token_type") or entry.get("token_type"),
        "scope": refreshed.get("scope") or entry.get("scope"),
    }
    if refreshed.get("refresh_token"):
        merged["refresh_token"] = refreshed["refresh_token"]
    return merged


def _refresh_error_detail(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            return exc.response.text[:500]
        except Exception:
            return str(exc)
    return str(exc)


async def _refresh_google(refresh_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        r.raise_for_status()
        return r.json()


async def _refresh_microsoft(refresh_token: str) -> dict[str, Any]:
    tenant = microsoft_oauth_tenant()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
            data={
                "client_id": os.getenv("MICROSOFT_OAUTH_CLIENT_ID", ""),
                "client_secret": os.getenv("MICROSOFT_OAUTH_CLIENT_SECRET", ""),
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        r.raise_for_status()
        return r.json()


async def _refresh_spotify(refresh_token: str) -> dict[str, Any]:
    import base64

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
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
        )
        r.raise_for_status()
        return r.json()
