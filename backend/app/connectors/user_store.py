"""Per-user connector OAuth tokens in Firestore (users/{uid}/private/connectors)."""
from __future__ import annotations

import logging
import time
from typing import Any

from app.core.firebase import _db, _ensure_db, firestore_available

logger = logging.getLogger(__name__)

CONNECTORS_DOC_ID = "connectors"


def _connectors_ref(uid: str):
    _ensure_db()
    if _db is None:
        return None
    return _db.collection("users").document(uid).collection("private").document(CONNECTORS_DOC_ID)


def _load_doc(uid: str) -> dict[str, Any]:
    ref = _connectors_ref(uid)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if not snap.exists:
            return {}
        data = snap.to_dict() or {}
        items = data.get("items")
        return dict(items) if isinstance(items, dict) else {}
    except Exception as exc:
        logger.warning("Failed to load connectors for %s: %s", uid, exc)
        return {}


def _save_doc(uid: str, items: dict[str, Any]) -> None:
    ref = _connectors_ref(uid)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        ref.set(
            {
                "items": items,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception as exc:
        logger.warning("Failed to save connectors for %s: %s", uid, exc)


def is_connected(uid: str, connector_id: str) -> bool:
    entry = _load_doc(uid).get(connector_id)
    return bool(entry and entry.get("access_token"))


def get_connection(uid: str, connector_id: str) -> dict[str, Any] | None:
    entry = _load_doc(uid).get(connector_id)
    return dict(entry) if isinstance(entry, dict) else None


def set_connection(uid: str, connector_id: str, provider: str, tokens: dict[str, Any]) -> None:
    if not firestore_available():
        raise RuntimeError(
            "Firestore indisponible sur le serveur. "
            "Ajoutez firebase-adminsdk.json ou GOOGLE_APPLICATION_CREDENTIALS dans backend/.env."
        )
    items = _load_doc(uid)
    expires_in = tokens.get("expires_in")
    expires_at = None
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        expires_at = time.time() + float(expires_in)

    items[connector_id] = {
        "provider": provider,
        "connected_at": time.time(),
        "expires_at": expires_at,
        **tokens,
    }
    _save_doc(uid, items)


def remove_connection(uid: str, connector_id: str) -> None:
    items = _load_doc(uid)
    if connector_id not in items:
        return
    del items[connector_id]
    _save_doc(uid, items)
