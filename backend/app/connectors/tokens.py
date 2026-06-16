"""Refresh and resolve OAuth access tokens for all connector providers."""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx

from app.connectors.registry import CONNECTORS, microsoft_oauth_tenant
from app.connectors.user_store import get_connection, set_connection

logger = logging.getLogger(__name__)


async def get_valid_access_token(uid: str, connector_id: str) -> str | None:
    spec = CONNECTORS.get(connector_id)
    if not spec:
        return None
    if spec.provider == "google":
        return await _get_valid_google_token(uid, connector_id)
    if spec.provider == "microsoft":
        return await _get_valid_microsoft_token(uid, connector_id)
    if spec.provider == "notion":
        entry = get_connection(uid, connector_id)
        token = entry.get("access_token") if entry else None
        return str(token) if token else None
    if spec.provider == "figma":
        return await _get_valid_figma_token(uid, connector_id)
    return None


def connection_account_label(entry: dict[str, Any] | None) -> str | None:
    if not entry:
        return None
    for key in ("account_email", "workspace_name", "account_name", "user_name", "user_id"):
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
    if isinstance(expires_at, (int, float)) and time.time() < float(expires_at) - 60:
        return str(access_token)

    refresh_token = entry.get("refresh_token")
    if not refresh_token:
        return str(access_token)

    try:
        refreshed = await _refresh_google(refresh_token)
    except Exception as exc:
        logger.warning("Google token refresh failed for %s/%s: %s", uid, connector_id, exc)
        return str(access_token)

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
    if isinstance(expires_at, (int, float)) and time.time() < float(expires_at) - 60:
        return str(access_token)

    refresh_token = entry.get("refresh_token")
    if not refresh_token:
        return str(access_token)

    try:
        refreshed = await _refresh_microsoft(refresh_token)
    except Exception as exc:
        logger.warning("Microsoft token refresh failed for %s/%s: %s", uid, connector_id, exc)
        return str(access_token)

    merged = _merge_token_entry(entry, refreshed, "microsoft")
    set_connection(uid, connector_id, "microsoft", merged)
    token = merged.get("access_token")
    return str(token) if token else None


async def _get_valid_figma_token(uid: str, connector_id: str) -> str | None:
    entry = get_connection(uid, connector_id)
    if not entry:
        return None

    access_token = entry.get("access_token")
    if not access_token:
        return None

    expires_at = entry.get("expires_at")
    if isinstance(expires_at, (int, float)) and time.time() < float(expires_at) - 60:
        return str(access_token)

    refresh_token = entry.get("refresh_token")
    if not refresh_token:
        return str(access_token)

    try:
        refreshed = await _refresh_figma(refresh_token)
    except Exception as exc:
        logger.warning("Figma token refresh failed for %s/%s: %s", uid, connector_id, exc)
        return str(access_token)

    merged = _merge_token_entry(entry, refreshed, "figma")
    set_connection(uid, connector_id, "figma", merged)
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


async def _refresh_figma(refresh_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.figma.com/v1/oauth/token",
            data={
                "client_id": os.getenv("FIGMA_CLIENT_ID", ""),
                "client_secret": os.getenv("FIGMA_CLIENT_SECRET", ""),
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        r.raise_for_status()
        return r.json()
