"""Signed OAuth state tokens (serverless-safe — no in-memory store)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

_STATE_TTL_SEC = 600


def _state_secret() -> bytes:
    for key in (
        "FORMA_OAUTH_STATE_SECRET",
        "SPOTIFY_CLIENT_SECRET",
        "GOOGLE_CLIENT_SECRET",
        "MICROSOFT_OAUTH_CLIENT_SECRET",
        "FIREBASE_SERVICE_ACCOUNT_JSON",
    ):
        raw = (os.getenv(key) or "").strip()
        if raw:
            return raw.encode()
    return b"forma-oauth-dev-insecure"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def issue_oauth_state(
    *,
    connector_id: str,
    uid: str,
    return_origin: str | None,
    return_path: str | None,
    redirect_base: str | None,
) -> str:
    payload = {
        "n": secrets.token_urlsafe(8),
        "c": connector_id,
        "u": uid,
        "ro": return_origin,
        "rp": return_path,
        "rb": redirect_base,
        "exp": int(time.time()) + _STATE_TTL_SEC,
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = hmac.new(_state_secret(), raw, hashlib.sha256).digest()
    return f"{_b64url_encode(raw)}.{_b64url_encode(sig)}"


def parse_oauth_state(state: str) -> dict[str, Any] | None:
    token = (state or "").strip()
    if not token or "." not in token:
        return None
    body, mac = token.split(".", 1)
    try:
        raw = _b64url_decode(body)
        expected = hmac.new(_state_secret(), raw, hashlib.sha256).digest()
        got = _b64url_decode(mac)
        if not hmac.compare_digest(expected, got):
            return None
        payload = json.loads(raw.decode())
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    exp = payload.get("exp")
    if not isinstance(exp, (int, float)) or float(exp) < time.time():
        return None
    connector_id = str(payload.get("c") or "").strip()
    uid = str(payload.get("u") or "").strip()
    if not connector_id or not uid:
        return None
    return payload
