"""Persist connector OAuth tokens on disk."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import _data_dir

_LOCK = threading.Lock()
_STORE_PATH = _data_dir() / "connectors.json"


def _ensure_parent() -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_all() -> dict[str, Any]:
    _ensure_parent()
    if not _STORE_PATH.exists():
        return {}
    try:
        return json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_all(data: dict[str, Any]) -> None:
    _ensure_parent()
    _STORE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def is_connected(connector_id: str) -> bool:
    with _LOCK:
        entry = load_all().get(connector_id)
    return bool(entry and entry.get("access_token"))


def set_connection(connector_id: str, provider: str, tokens: dict[str, Any]) -> None:
    with _LOCK:
        data = load_all()
        data[connector_id] = {
            "provider": provider,
            "connected_at": datetime.now(timezone.utc).isoformat(),
            **tokens,
        }
        save_all(data)


def remove_connection(connector_id: str) -> None:
    with _LOCK:
        data = load_all()
        if connector_id in data:
            del data[connector_id]
            save_all(data)


def get_access_token(connector_id: str) -> str | None:
    with _LOCK:
        entry = load_all().get(connector_id)
    if not entry:
        return None
    token = entry.get("access_token")
    return str(token) if token else None
