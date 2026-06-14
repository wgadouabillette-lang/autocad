"""Sync follow-up events to Google Calendar when connected."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, List, Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.connectors.store import get_access_token, is_connected

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


class CalendarEventInput(BaseModel):
    title: str
    detail: Optional[str] = None
    date_key: str = Field(alias="dateKey")
    start_minutes: int = Field(alias="startMinutes")
    end_minutes: int = Field(alias="endMinutes")

    model_config = ConfigDict(populate_by_name=True)


class SyncEventsBody(BaseModel):
    events: List[CalendarEventInput]


def _event_datetimes(item: CalendarEventInput) -> tuple[str, str]:
    year, month, day = (int(x) for x in item.date_key.split("-"))
    start_h, start_m = divmod(item.start_minutes, 60)
    end_h, end_m = divmod(item.end_minutes, 60)
    tz = datetime.now().astimezone().tzinfo
    start = datetime(year, month, day, start_h, start_m, tzinfo=tz)
    end = datetime(year, month, day, end_h, end_m, tzinfo=tz)
    if end <= start:
        end = start + timedelta(minutes=30)
    return start.isoformat(), end.isoformat()


async def _create_google_event(token: str, item: CalendarEventInput) -> bool:
    start, end = _event_datetimes(item)
    body: dict[str, Any] = {
        "summary": item.title,
        "description": item.detail or "",
        "start": {"dateTime": start, "timeZone": datetime.now().astimezone().tzname() or "UTC"},
        "end": {"dateTime": end, "timeZone": datetime.now().astimezone().tzname() or "UTC"},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
    return r.status_code in {200, 201}


@router.post("/calendar/events")
async def sync_calendar_events(body: SyncEventsBody):
    if not is_connected("calendar"):
        return {"synced": False, "created": 0, "reason": "not_connected"}

    token = get_access_token("calendar")
    if not token:
        return {"synced": False, "created": 0, "reason": "not_connected"}

    created = 0
    for item in body.events:
        try:
            if await _create_google_event(token, item):
                created += 1
        except Exception:  # noqa: BLE001 — continue syncing remaining events
            continue

    return {
        "synced": created > 0,
        "created": created,
        "reason": None if created else "google_api_error",
    }
