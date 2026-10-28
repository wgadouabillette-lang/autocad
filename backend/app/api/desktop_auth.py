"""Authentification bureau — sessions OAuth via navigateur externe."""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import threading
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.core.auth_deps import optional_firebase_user
from app.core.firebase import FirebaseUser
from app.core.rate_limit import rate_limit_request

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


class StartDesktopAuthRequest(BaseModel):
    sessionId: str = Field(min_length=36, max_length=36)
    claimSecret: str = Field(min_length=32, max_length=200)


class ClaimDesktopAuthRequest(BaseModel):
    sessionId: str = Field(min_length=36, max_length=36)
    claimSecret: str = Field(min_length=32, max_length=200)


def _assert_session_id(session_id: str) -> str:
    value = session_id.strip()
    if not SESSION_RE.fullmatch(value):
        raise HTTPException(400, "Invalid desktop auth session id.")
    return value


def _claim_secret_hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def _hashes_match(stored: object, digest: str) -> bool:
    if not isinstance(stored, str) or len(stored) != len(digest):
        return False
    return hmac.compare_digest(stored, digest)


def _memory_claim_hash(session_id: str) -> Optional[str]:
    with _lock:
        entry = _sessions.get(session_id)
        stored = entry.get("claimSecretHash") if entry else None
    return stored if isinstance(stored, str) else None


def _firestore_claim_hash(session_id: str) -> Optional[str]:
    try:
        from app.core.firebase import firestore_available

        if not firestore_available():
            return None
        from firebase_admin import firestore

        snap = firestore.client().document(f"desktopAuthSessions/{session_id}").get()
        if not snap.exists:
            return None
        stored = (snap.to_dict() or {}).get("claimSecretHash")
        return stored if isinstance(stored, str) else None
    except Exception:
        logger.warning("Could not read desktop auth claim hash.", exc_info=True)
        return None


def _claim_secret_matches(session_id: str, secret: str) -> bool:
    digest = _claim_secret_hash(secret)
    if _hashes_match(_memory_claim_hash(session_id), digest):
        return True
    return _hashes_match(_firestore_claim_hash(session_id), digest)


def _register_claim_secret(session_id: str, digest: str) -> None:
    existing_remote = _firestore_claim_hash(session_id)
    if isinstance(existing_remote, str) and not _hashes_match(existing_remote, digest):
        raise HTTPException(409, "Desktop auth session already started.")

    now = time.time()
    with _lock:
        entry = _sessions.get(session_id)
        stored = entry.get("claimSecretHash") if entry else None
        if isinstance(stored, str) and not _hashes_match(stored, digest):
            raise HTTPException(409, "Desktop auth session already started.")
        expires_at = now + SESSION_TTL_SECONDS
        if entry is not None:
            previous_expiry = float(entry.get("expiresAt", 0) or 0)
            if previous_expiry > now:
                expires_at = previous_expiry
        _sessions[session_id] = {
            **(entry or {}),
            "claimSecretHash": digest,
            "expiresAt": expires_at,
        }

    if isinstance(existing_remote, str):
        return

    try:
        from app.core.firebase import firestore_available

        if not firestore_available():
            return
        from firebase_admin import firestore

        db = firestore.client()
        ref = db.document(f"desktopAuthSessions/{session_id}")

        @firestore.transactional
        def _txn(transaction: Any) -> None:
            snap = ref.get(transaction=transaction)
            if snap.exists:
                existing = (snap.to_dict() or {}).get("claimSecretHash")
                if isinstance(existing, str) and not _hashes_match(existing, digest):
                    raise HTTPException(409, "Desktop auth session already started.")
                if isinstance(existing, str):
                    return
            transaction.set(
                ref,
                {
                    "claimSecretHash": digest,
                    "createdAt": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )

        _txn(db.transaction())
    except HTTPException:
        with _lock:
            _sessions.pop(session_id, None)
        raise
    except Exception:
        logger.warning("Could not store desktop auth claim hash.", exc_info=True)
        if not firestore_available_safe():
            return
        with _lock:
            _sessions.pop(session_id, None)
        raise HTTPException(503, "Desktop auth session could not be started.") from None


def firestore_available_safe() -> bool:
    try:
        from app.core.firebase import firestore_available

        return firestore_available()
    except Exception:
        return False


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
            },
            merge=True,
        )
    except Exception:
        logger.warning("Could not publish desktop auth session to Firestore.", exc_info=True)


def _delete_firestore_session(session_id: str) -> None:
    try:
        from app.core.firebase import firestore_available

        if not firestore_available():
            return
        from firebase_admin import firestore

        firestore.client().document(f"desktopAuthSessions/{session_id}").delete()
    except Exception:
        logger.warning("Could not delete desktop auth session.", exc_info=True)


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
            provider == "google"
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


@router.post("/start")
def start_desktop_auth(body: StartDesktopAuthRequest, request: Request):
    """Register the claim secret before the browser URL exists."""
    rate_limit_request(request, "desktop_auth_start", limit=20, window_sec=60)
    session_id = _assert_session_id(body.sessionId)
    digest = _claim_secret_hash(body.claimSecret)
    _register_claim_secret(session_id, digest)
    return {"ok": True}


@router.post("/complete")
def complete_desktop_auth(
    body: CompleteDesktopAuthRequest,
    user: Optional[FirebaseUser] = Depends(optional_firebase_user),
):
    session_id = _assert_session_id(body.sessionId)
    # 0.1.18 never calls /start. Completing those sessions keeps already
    # installed apps able to sign in. 0.1.19+ registers a claim hash first.
    firebase_user = _require_user(user)
    custom_token = _create_custom_token(firebase_user.uid)
    now = time.time()
    with _lock:
        _purge_expired(now)
        existing = _sessions.get(session_id) or {}
        _sessions[session_id] = {
            **existing,
            "token": custom_token,
            "uid": firebase_user.uid,
            "expiresAt": now + SESSION_TTL_SECONDS,
        }
    _publish_session_to_firestore(session_id, firebase_user.uid, custom_token)
    return {"ok": True}


@router.get("/claim")
def claim_desktop_auth_legacy(sessionId: str = Query(..., min_length=36, max_length=36)):
    """Unsigned claim used by desktop builds before 0.1.19.

    Sessions that registered a claim secret stay on POST /claim so a newer
    login cannot be taken by the old endpoint.
    """
    session_id = _assert_session_id(sessionId)
    if _memory_claim_hash(session_id) or _firestore_claim_hash(session_id):
        return {"status": "pending"}

    now = time.time()
    with _lock:
        _purge_expired(now)
        entry = _sessions.pop(session_id, None)

    if entry is not None:
        expires_at = float(entry.get("expiresAt", 0) or 0)
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


@router.post("/claim")
def claim_desktop_auth(body: ClaimDesktopAuthRequest, request: Request):
    rate_limit_request(request, "desktop_auth_claim", limit=90, window_sec=60)
    session_id = _assert_session_id(body.sessionId)
    if not _claim_secret_matches(session_id, body.claimSecret):
        raise HTTPException(403, "Desktop auth claim was refused.")
    now = time.time()
    token: Optional[str] = None
    with _lock:
        _purge_expired(now)
        entry = _sessions.get(session_id)
        if entry is not None:
            expires_at = float(entry.get("expiresAt", 0) or 0)
            if expires_at <= now:
                _sessions.pop(session_id, None)
                raise HTTPException(410, "Desktop auth session expired.")
            stored_token = entry.get("token")
            if isinstance(stored_token, str) and stored_token:
                _sessions.pop(session_id, None)
                token = stored_token

    if token is not None:
        _delete_firestore_session(session_id)
        return {"status": "ready", "customToken": token}

    firestore_claim = _claim_from_firestore(session_id)
    if firestore_claim is not None:
        return firestore_claim

    return {"status": "pending"}
