"""Per-user connector OAuth tokens in Firestore (users/{uid}/private/connectors)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from app.core.config import _data_dir
from app.core.firebase import _db, _ensure_db, firestore_available

logger = logging.getLogger(__name__)

CONNECTORS_DOC_ID = "connectors"
_LOCAL_STORE_DIR = _data_dir() / "connector_tokens"


def _local_store_path(uid: str) -> Path:
    safe_uid = uid.replace("/", "_")
    return _LOCAL_STORE_DIR / f"{safe_uid}.json"


def _load_local_doc(uid: str) -> dict[str, Any]:
    path = _local_store_path(uid)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data.get("items")
        return dict(items) if isinstance(items, dict) else {}
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load local connectors for %s: %s", uid, exc)
        return {}


def _save_local_doc(uid: str, items: dict[str, Any]) -> None:
    path = _local_store_path(uid)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"items": items}, indent=2), encoding="utf-8")


def _using_local_store() -> bool:
    if firestore_available():
        return False
    _ensure_db()
    return _db is None


def _connectors_ref(uid: str):
    _ensure_db()
    if _db is None:
        return None
    return _db.collection("users").document(uid).collection("private").document(CONNECTORS_DOC_ID)


def _load_doc(uid: str) -> dict[str, Any]:
    if _using_local_store():
        return _load_local_doc(uid)

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
    if _using_local_store():
        _save_local_doc(uid, items)
        return

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
    if _using_local_store():
        logger.info("Saved connector %s for %s to local dev store.", connector_id, uid)


def remove_connection(uid: str, connector_id: str) -> None:
    items = _load_doc(uid)
    if connector_id not in items:
        return
    del items[connector_id]
    _save_doc(uid, items)
