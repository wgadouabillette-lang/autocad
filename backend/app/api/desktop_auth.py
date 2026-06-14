"""Authentification bureau — sessions OAuth via navigateur externe."""
from __future__ import annotations

import re
import threading
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth_deps import optional_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api/auth/desktop", tags=["auth"])

SESSION_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
SESSION_TTL_SECONDS = 10 * 60

_lock = threading.Lock()
_sessions: dict[str, dict[str, object]] = {}


class CompleteDesktopAuthRequest(BaseModel):
    sessionId: str = Field(min_length=36, max_length=36)


def _assert_session_id(session_id: str) -> str:
    value = session_id.strip()
    if not SESSION_RE.fullmatch(value):
        raise HTTPException(400, "Invalid desktop auth session id.")
    return value


def _require_user(user: Optional[FirebaseUser]) -> FirebaseUser:
    if user is None:
        raise HTTPException(401, "Authentication required.")
    return user


def _create_custom_token(uid: str) -> str:
    from app.core.firebase import _ensure_app

    _ensure_app()
    try:
        from firebase_admin import auth
    except ImportError as exc:
        raise HTTPException(503, "Firebase Admin SDK unavailable.") from exc

    try:
        return auth.create_custom_token(uid).decode("utf-8")
    except Exception as exc:
        raise HTTPException(503, "Unable to create desktop auth token.") from exc


def _purge_expired(now: float) -> None:
    expired = [
        session_id
        for session_id, entry in _sessions.items()
        if float(entry.get("expiresAt", 0)) <= now
    ]
    for session_id in expired:
        _sessions.pop(session_id, None)


@router.post("/complete")
def complete_desktop_auth(
    body: CompleteDesktopAuthRequest,
    user: Optional[FirebaseUser] = Depends(optional_firebase_user),
):
    session_id = _assert_session_id(body.sessionId)
    firebase_user = _require_user(user)
    custom_token = _create_custom_token(firebase_user.uid)
    now = time.time()
    with _lock:
        _purge_expired(now)
        _sessions[session_id] = {
            "token": custom_token,
            "uid": firebase_user.uid,
            "expiresAt": now + SESSION_TTL_SECONDS,
        }
    return {"ok": True}


@router.get("/claim")
def claim_desktop_auth(sessionId: str = Query(..., min_length=36, max_length=36)):
    session_id = _assert_session_id(sessionId)
    now = time.time()
    with _lock:
        _purge_expired(now)
        entry = _sessions.pop(session_id, None)

    if entry is None:
        return {"status": "pending"}

    expires_at = float(entry.get("expiresAt", 0))
    if expires_at <= now:
        raise HTTPException(410, "Desktop auth session expired.")

    token = entry.get("token")
    if not isinstance(token, str) or not token:
        raise HTTPException(500, "Desktop auth session is invalid.")

    return {"status": "ready", "customToken": token}
