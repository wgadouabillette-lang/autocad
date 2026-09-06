"""Authentification bureau — sessions OAuth via navigateur externe."""
from __future__ import annotations

import logging
import re
import threading
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.auth_deps import optional_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api/auth/desktop", tags=["auth"])
logger = logging.getLogger(__name__)

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
        token = auth.create_custom_token(uid)
        return token.decode("utf-8") if isinstance(token, bytes) else str(token)
    except Exception as exc:
        raise HTTPException(503, "Unable to create desktop auth token.") from exc


def _publish_session_to_firestore(session_id: str, uid: str, custom_token: str) -> None:
    """Mirror the session so Electron can claim via Admin (backend or Functions)."""
    try:
        from app.core.firebase import firestore_available

        if not firestore_available():
            return
        from firebase_admin import firestore

        firestore.client().document(f"desktopAuthSessions/{session_id}").set(
            {
                "token": custom_token,
                "uid": uid,
                "createdAt": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception:
        logger.warning("Could not publish desktop auth session to Firestore.", exc_info=True)


def _purge_expired(now: float) -> None:
    expired = [
        session_id
        for session_id, entry in _sessions.items()
        if float(entry.get("expiresAt", 0)) <= now
    ]
    for session_id in expired:
        _sessions.pop(session_id, None)


def _claim_from_firestore(session_id: str) -> Optional[dict[str, Any]]:
    """One-shot claim via Admin SDK (docs are not client-readable)."""
    try:
        from app.core.firebase import firestore_available

        if not firestore_available():
            return None
        from firebase_admin import firestore
    except Exception:
        return None

    db = firestore.client()
    ref = db.document(f"desktopAuthSessions/{session_id}")

    @firestore.transactional
    def _txn(transaction: Any) -> Optional[dict[str, Any]]:
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return None
        data = snap.to_dict() or {}
        created = data.get("createdAt")
        created_ms = 0
        if created is not None and hasattr(created, "timestamp"):
            created_ms = int(created.timestamp() * 1000)
        if created_ms and time.time() * 1000 - created_ms > SESSION_TTL_SECONDS * 1000:
            transaction.delete(ref)
            raise HTTPException(410, "Desktop auth session expired.")

        custom_token = data.get("token") or data.get("customToken")
        if isinstance(custom_token, str) and custom_token:
            transaction.delete(ref)
            return {"status": "ready", "customToken": custom_token}

        provider = data.get("provider")
        id_token = data.get("idToken")
        if (
            provider in ("google", "microsoft", "facebook")
            and isinstance(id_token, str)
            and id_token
        ):
            access = data.get("accessToken")
            transaction.delete(ref)
            payload: dict[str, Any] = {
                "status": "ready",
                "provider": provider,
                "idToken": id_token,
            }
            if isinstance(access, str) and access:
                payload["accessToken"] = access
            return payload

        return None

    try:
        return _txn(db.transaction())
    except HTTPException:
        raise
    except Exception:
        logger.warning("Desktop auth Firestore claim failed for %s", session_id, exc_info=True)
        return None


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
    _publish_session_to_firestore(session_id, firebase_user.uid, custom_token)
    return {"ok": True}


@router.get("/claim")
def claim_desktop_auth(sessionId: str = Query(..., min_length=36, max_length=36)):
    session_id = _assert_session_id(sessionId)
    now = time.time()
    with _lock:
        _purge_expired(now)
        entry = _sessions.pop(session_id, None)

    if entry is not None:
        expires_at = float(entry.get("expiresAt", 0))
        if expires_at <= now:
            raise HTTPException(410, "Desktop auth session expired.")

        token = entry.get("token")
        if not isinstance(token, str) or not token:
            raise HTTPException(500, "Desktop auth session is invalid.")

        return {"status": "ready", "customToken": token}

    firestore_claim = _claim_from_firestore(session_id)
    if firestore_claim is not None:
        return firestore_claim

    return {"status": "pending"}
