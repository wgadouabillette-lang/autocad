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


def _load_firestore_items(uid: str) -> dict[str, Any] | None:
    """Return connector map, or None if the read failed (do not treat as empty)."""
    ref = _connectors_ref(uid)
    if ref is None:
        return None
    try:
        snap = ref.get()
        if not snap.exists:
            return {}
        data = snap.to_dict() or {}
        items = data.get("items")
        return dict(items) if isinstance(items, dict) else {}
    except Exception as exc:
        logger.warning("Failed to load connectors for %s: %s", uid, exc)
        return None


def _set_firestore_connector(uid: str, connector_id: str, entry: dict[str, Any]) -> bool:
    """Upsert one connector without touching sibling keys."""
    ref = _connectors_ref(uid)
    if ref is None:
        return False
    try:
        from firebase_admin import firestore

        ref.set(
            {
                f"items.{connector_id}": entry,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return True
    except Exception as exc:
        logger.warning("Failed to save connector %s for %s: %s", connector_id, uid, exc)
        return False


def _delete_firestore_connector(uid: str, connector_id: str) -> bool:
    """Delete one connector key. merge=True cannot remove nested keys."""
    ref = _connectors_ref(uid)
    if ref is None:
        return False
    try:
        from firebase_admin import firestore

        ref.update(
            {
                f"items.{connector_id}": firestore.DELETE_FIELD,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        )
        return True
    except Exception as exc:
        # Document missing — nothing to delete.
        logger.warning("Failed to delete connector %s for %s: %s", connector_id, uid, exc)
        return False


def _migrate_local_items_to_firestore(uid: str, items: dict[str, Any]) -> bool:
    """One-shot migration: write each connector key with merge (never wipe siblings)."""
    if not items:
        return True
    ok = True
    for connector_id, entry in items.items():
        if isinstance(entry, dict):
            ok = _set_firestore_connector(uid, connector_id, entry) and ok
    return ok


def _load_doc(uid: str) -> dict[str, Any]:
    now = time.time()
    cached = _ITEMS_CACHE.get(uid)
    if cached and cached[1] > now:
        return dict(cached[0])

    if _using_local_store():
        items = _load_local_doc(uid)
        _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
        return dict(items)

    items = _load_firestore_items(uid)
    if items is None:
        # Read failed — fall back to local without caching empty as authoritative.
        local_items = _load_local_doc(uid)
        return dict(local_items)

    if items:
        _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
        return dict(items)

    local_items = _load_local_doc(uid)
    if local_items and _migrate_local_items_to_firestore(uid, local_items):
        logger.info(
            "Migrated connector tokens for %s from local dev store to Firestore.",
            uid,
        )
        items = local_items
    else:
        items = local_items or {}

    # Only cache definitive empty docs (successful Firestore read with no items).
    _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
    return dict(items)


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
    expires_in = tokens.get("expires_in")
    expires_at = None
    if isinstance(expires_in, (int, float)) and expires_in > 0:
        expires_at = time.time() + float(expires_in)

    entry = {
        "provider": provider,
        "connected_at": time.time(),
        "expires_at": expires_at,
        **tokens,
    }

    _invalidate_items_cache(uid)
    if _using_local_store():
        items = _load_local_doc(uid)
        items[connector_id] = entry
        _save_local_doc(uid, items)
        logger.info("Saved connector %s for %s to local dev store.", connector_id, uid)
        return

    if _set_firestore_connector(uid, connector_id, entry):
        return

    items = _load_local_doc(uid)
    items[connector_id] = entry
    _save_local_doc(uid, items)
    logger.info("Saved connector tokens for %s to local dev store (Firestore unavailable).", uid)


def remove_connection(uid: str, connector_id: str) -> None:
    _invalidate_items_cache(uid)
    if _using_local_store():
        items = _load_local_doc(uid)
        if connector_id in items:
            del items[connector_id]
            _save_local_doc(uid, items)
        return

    if _delete_firestore_connector(uid, connector_id):
        return

    items = _load_local_doc(uid)
    if connector_id in items:
        del items[connector_id]
        _save_local_doc(uid, items)
