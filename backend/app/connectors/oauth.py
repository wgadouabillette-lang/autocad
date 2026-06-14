"""OAuth authorize URL + token exchange."""
from __future__ import annotations

import base64
import secrets
import time
from typing import Any

import httpx

from app.connectors.registry import CONNECTORS, build_authorize_url, callback_url
from app.connectors.store import set_connection

_PENDING_STATES: dict[str, dict[str, Any]] = {}
_STATE_TTL_SEC = 600


def _gc_states() -> None:
    now = time.time()
    expired = [k for k, v in _PENDING_STATES.items() if now - v["created"] > _STATE_TTL_SEC]
    for key in expired:
        _PENDING_STATES.pop(key, None)


def create_authorize_session(connector_id: str) -> tuple[str, str]:
    _gc_states()
    state = secrets.token_urlsafe(24)
    _PENDING_STATES[state] = {
        "connector_id": connector_id,
        "created": time.time(),
    }
    url = build_authorize_url(connector_id, state)
    return state, url


def pop_state(state: str) -> str | None:
    _gc_states()
    entry = _PENDING_STATES.pop(state, None)
    if not entry:
        return None
    return str(entry["connector_id"])


async def exchange_code(connector_id: str, code: str) -> dict[str, Any]:
    spec = CONNECTORS[connector_id]
    if spec.provider == "google":
        tokens = await _exchange_google(code)
    elif spec.provider == "notion":
        tokens = await _exchange_notion(code)
    elif spec.provider == "figma":
        tokens = await _exchange_figma(code)
    else:
        raise ValueError(f"Unsupported provider: {spec.provider}")

    set_connection(connector_id, spec.provider, tokens)
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

