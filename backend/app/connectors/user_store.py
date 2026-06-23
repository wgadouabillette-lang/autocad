"""Per-user connector OAuth tokens in Firestore (users/{uid}/private/connectors)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

from app.core import firebase
from app.core.config import _data_dir

logger = logging.getLogger(__name__)

CONNECTORS_DOC_ID = "connectors"
_LOCAL_STORE_DIR = _data_dir() / "connector_tokens"
_ITEMS_CACHE: dict[str, tuple[dict[str, Any], float]] = {}
_ITEMS_CACHE_TTL_SEC = 30.0


def _invalidate_items_cache(uid: str) -> None:
    _ITEMS_CACHE.pop(uid, None)


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
    firebase._ensure_db()
    return firebase._db is None


def _connectors_ref(uid: str):
    firebase._ensure_db()
    if firebase._db is None:
        return None
    return (
        firebase._db.collection("users")
        .document(uid)
        .collection("private")
        .document(CONNECTORS_DOC_ID)
    )


def _load_firestore_items(uid: str) -> dict[str, Any]:
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


def _save_firestore_items(uid: str, items: dict[str, Any]) -> bool:
    ref = _connectors_ref(uid)
    if ref is None:
        return False
    try:
        from firebase_admin import firestore

        ref.set(
            {
                "items": items,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return True
    except Exception as exc:
        logger.warning("Failed to save connectors for %s: %s", uid, exc)
        return False


def _load_doc(uid: str) -> dict[str, Any]:
    now = time.time()
    cached = _ITEMS_CACHE.get(uid)
    if cached and cached[1] > now:
        return dict(cached[0])

    if _using_local_store():
        items = _load_local_doc(uid)
    else:
        items = _load_firestore_items(uid)
        if items:
            _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
            return items

        local_items = _load_local_doc(uid)
        if not local_items:
            items = {}
        elif _save_firestore_items(uid, local_items):
            logger.info(
                "Migrated connector tokens for %s from local dev store to Firestore.",
                uid,
            )
            items = local_items
        else:
            items = local_items

    _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
    return items


def _save_doc(uid: str, items: dict[str, Any]) -> None:
    _invalidate_items_cache(uid)
    if _using_local_store():
        _save_local_doc(uid, items)
        return

    if _save_firestore_items(uid, items):
        return

    _save_local_doc(uid, items)
    logger.info("Saved connector tokens for %s to local dev store (Firestore unavailable).", uid)


def load_all_connections(uid: str) -> dict[str, Any]:
    """All connector tokens for a user (one Firestore read, cached 30s)."""
    return _load_doc(uid)


def is_connected_from_items(items: dict[str, Any], connector_id: str) -> bool:
    entry = items.get(connector_id)
    return bool(entry and entry.get("access_token"))


def is_connected(uid: str, connector_id: str) -> bool:
    return is_connected_from_items(_load_doc(uid), connector_id)


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
