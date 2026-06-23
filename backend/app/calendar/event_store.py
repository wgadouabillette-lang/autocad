"""Per-user calendar blocks in Firestore (users/{uid}/private/calendarEvents)."""
from __future__ import annotations

import json
import logging
import secrets
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core import firebase
from app.core.config import _data_dir

logger = logging.getLogger(__name__)

CALENDAR_EVENTS_DOC_ID = "calendarEvents"
_LOCAL_STORE_DIR = _data_dir() / "calendar_events"
_ITEMS_CACHE: dict[str, tuple[dict[str, Any], float]] = {}
_ITEMS_CACHE_TTL_SEC = 30.0
_LAST_PURGE_AT: dict[str, float] = {}
_PURGE_INTERVAL_SEC = 60.0


def _invalidate_items_cache(uid: str) -> None:
    _ITEMS_CACHE.pop(uid, None)


def _local_store_path(uid: str) -> Path:
    safe_uid = uid.replace("/", "_")
    return _LOCAL_STORE_DIR / f"{safe_uid}.json"


def _using_local_store() -> bool:
    firebase._ensure_db()
    return firebase._db is None


def _events_ref(uid: str):
    firebase._ensure_db()
    if firebase._db is None:
        return None
    return (
        firebase._db.collection("users")
        .document(uid)
        .collection("private")
        .document(CALENDAR_EVENTS_DOC_ID)
    )


def _load_local_items(uid: str) -> dict[str, Any]:
    path = _local_store_path(uid)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        items = data.get("items")
        return dict(items) if isinstance(items, dict) else {}
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to load local calendar events for %s: %s", uid, exc)
        return {}


def _save_local_items(uid: str, items: dict[str, Any]) -> None:
    path = _local_store_path(uid)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"items": items}, indent=2), encoding="utf-8")


def _load_firestore_items(uid: str) -> dict[str, Any]:
    ref = _events_ref(uid)
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
        logger.warning("Failed to load calendar events for %s: %s", uid, exc)
        return {}


def _save_firestore_items(uid: str, items: dict[str, Any]) -> bool:
    ref = _events_ref(uid)
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
        logger.warning("Failed to save calendar events for %s: %s", uid, exc)
        return False


def _load_items(uid: str) -> dict[str, Any]:
    now = time.time()
    cached = _ITEMS_CACHE.get(uid)
    if cached and cached[1] > now:
        return dict(cached[0])

    if _using_local_store():
        items = _load_local_items(uid)
    else:
        items = _load_firestore_items(uid)
        if items:
            _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
            return items
        local_items = _load_local_items(uid)
        if not local_items:
            items = {}
        elif _save_firestore_items(uid, local_items):
            logger.info("Migrated calendar events for %s from local dev store to Firestore.", uid)
            items = local_items
        else:
            items = local_items

    _ITEMS_CACHE[uid] = (items, now + _ITEMS_CACHE_TTL_SEC)
    return items


def _save_items(uid: str, items: dict[str, Any]) -> None:
    _invalidate_items_cache(uid)
    if _using_local_store():
        _save_local_items(uid, items)
        return
    if _save_firestore_items(uid, items):
        return
    _save_local_items(uid, items)


def event_end_epoch(date_key: str, end_minutes: int) -> float:
    year, month, day = (int(x) for x in date_key.split("-"))
    end_h, end_m = divmod(end_minutes, 60)
    tz = datetime.now().astimezone().tzinfo
    end = datetime(year, month, day, end_h, end_m, tzinfo=tz)
    return end.timestamp()


def new_event_id() -> str:
    return f"evt_{uuid.uuid4().hex[:16]}"


def normalize_event(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(raw.get("id") or new_event_id()),
        "title": str(raw.get("title") or "Sans titre").strip() or "Sans titre",
        "detail": str(raw.get("detail")).strip() if raw.get("detail") else None,
        "dateKey": str(raw.get("dateKey") or raw.get("date_key") or "").strip(),
        "startMinutes": int(raw.get("startMinutes") or raw.get("start_minutes") or 0),
        "endMinutes": int(raw.get("endMinutes") or raw.get("end_minutes") or 0),
        "source": str(raw.get("source") or "user"),
        "googleEventId": raw.get("googleEventId") or raw.get("google_event_id"),
        "outlookEventId": raw.get("outlookEventId") or raw.get("outlook_event_id"),
        "endsAt": float(raw.get("endsAt") or raw.get("ends_at") or 0),
        "createdAt": float(raw.get("createdAt") or raw.get("created_at") or time.time()),
    }


def list_events(uid: str) -> list[dict[str, Any]]:
    items = _load_items(uid)
    return [normalize_event(entry) for entry in items.values() if isinstance(entry, dict)]


def save_events(uid: str, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items = _load_items(uid)
    saved: list[dict[str, Any]] = []
    now = time.time()
    for raw in events:
        event = normalize_event(raw)
        if not event["dateKey"]:
            continue
        if event["endMinutes"] <= event["startMinutes"]:
            event["endMinutes"] = event["startMinutes"] + 30
        if not event.get("endsAt"):
            event["endsAt"] = event_end_epoch(event["dateKey"], event["endMinutes"])
        if not event.get("createdAt"):
            event["createdAt"] = now
        if not event.get("id") or event["id"] in items:
            event["id"] = new_event_id()
        items[event["id"]] = event
        saved.append(event)
    _save_items(uid, items)
    return saved


def delete_event(uid: str, event_id: str) -> dict[str, Any] | None:
    items = _load_items(uid)
    entry = items.pop(event_id, None)
    if entry is None:
        return None
    _save_items(uid, items)
    return normalize_event(entry) if isinstance(entry, dict) else None


def purge_expired(uid: str, *, now: float | None = None) -> list[dict[str, Any]]:
    cutoff = now if now is not None else time.time()
    last = _LAST_PURGE_AT.get(uid, 0.0)
    if cutoff - last < _PURGE_INTERVAL_SEC:
        return []
    _LAST_PURGE_AT[uid] = cutoff

    items = _load_items(uid)
    removed: list[dict[str, Any]] = []
    for event_id, entry in list(items.items()):
        if not isinstance(entry, dict):
            continue
        event = normalize_event(entry)
        ends_at = float(event.get("endsAt") or 0)
        if ends_at <= 0:
            ends_at = event_end_epoch(event["dateKey"], event["endMinutes"])
        if ends_at < cutoff:
            removed.append(event)
            del items[event_id]
    if removed:
        _save_items(uid, items)
    return removed