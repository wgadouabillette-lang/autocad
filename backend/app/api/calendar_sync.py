"""Sync in-app calendar events with Google Calendar."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.connectors.registry import connector_configured
from app.connectors.tokens import connection_account_label, get_valid_access_token
from app.connectors.user_store import get_connection, is_connected
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

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


class GoogleCalendarEventOut(BaseModel):
    id: str
    title: str
    detail: Optional[str] = None
    date_key: str = Field(alias="dateKey")
    start_minutes: int = Field(alias="startMinutes")
    end_minutes: int = Field(alias="endMinutes")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


class CalendarStatusOut(BaseModel):
    connected: bool
    configured: bool
    account_email: Optional[str] = Field(default=None, alias="accountEmail")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


def _event_datetimes(item: CalendarEventInput) -> tuple[str, str, str]:
    year, month, day = (int(x) for x in item.date_key.split("-"))
    start_h, start_m = divmod(item.start_minutes, 60)
    end_h, end_m = divmod(item.end_minutes, 60)
    tz = datetime.now().astimezone().tzinfo
    tz_name = datetime.now().astimezone().tzname() or "UTC"
    start = datetime(year, month, day, start_h, start_m, tzinfo=tz)
    end = datetime(year, month, day, end_h, end_m, tzinfo=tz)
    if end <= start:
        end = start + timedelta(minutes=30)
    return start.isoformat(), end.isoformat(), tz_name


def _minutes_from_google_datetime(value: dict[str, Any]) -> tuple[str, int, int] | None:
    if "dateTime" in value and value["dateTime"]:
        dt = datetime.fromisoformat(str(value["dateTime"]).replace("Z", "+00:00"))
        local = dt.astimezone()
        date_key = local.strftime("%Y-%m-%d")
        start_minutes = local.hour * 60 + local.minute
        return date_key, start_minutes, start_minutes + 30

    if "date" in value and value["date"]:
        date_key = str(value["date"])
        return date_key, 9 * 60, 10 * 60

    return None


def _parse_google_event(item: dict[str, Any]) -> GoogleCalendarEventOut | None:
    event_id = str(item.get("id") or "").strip()
    if not event_id:
        return None

    start_raw = item.get("start") or {}
    end_raw = item.get("end") or {}
    start_parsed = _minutes_from_google_datetime(start_raw)
    if not start_parsed:
        return None
    date_key, start_minutes, default_end = start_parsed

    end_minutes = default_end
    end_parsed = _minutes_from_google_datetime(end_raw)
    if end_parsed and end_parsed[0] == date_key:
        end_minutes = max(end_parsed[1], start_minutes + 15)
    elif end_parsed and end_parsed[0] != date_key:
        end_minutes = 24 * 60

    title = str(item.get("summary") or "Sans titre").strip() or "Sans titre"
    detail = str(item.get("description") or "").strip() or None

    return GoogleCalendarEventOut(
        id=event_id,
        title=title,
        detail=detail,
        dateKey=date_key,
        startMinutes=start_minutes,
        endMinutes=end_minutes,
    )


async def _create_google_event(token: str, item: CalendarEventInput) -> bool:
    start, end, tz_name = _event_datetimes(item)
    body: dict[str, Any] = {
        "summary": item.title,
        "description": item.detail or "",
        "start": {"dateTime": start, "timeZone": tz_name},
        "end": {"dateTime": end, "timeZone": tz_name},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
    return r.status_code in {200, 201}


async def _fetch_google_account_email(token: str) -> str | None:
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        return None
    data = r.json()
    email = data.get("email")
    return str(email).strip() if email else None


@router.get("/calendar/status")
async def calendar_status(user: FirebaseUser = Depends(require_firebase_user)):
    configured = connector_configured("calendar")
    connected = configured and is_connected(user.uid, "calendar")
    account_email = connection_account_label(get_connection(user.uid, "calendar"))
    if connected and not account_email:
        token = await get_valid_access_token(user.uid, "calendar")
        if token:
            account_email = await _fetch_google_account_email(token)
    return CalendarStatusOut(
        connected=connected,
        configured=configured,
        accountEmail=account_email,
    )


@router.get("/calendar/events")
async def list_calendar_events(
    time_min: str = Query(..., alias="timeMin"),
    time_max: str = Query(..., alias="timeMax"),
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not connector_configured("calendar"):
        return {"events": [], "reason": "not_configured"}
    if not is_connected(user.uid, "calendar"):
        return {"events": [], "reason": "not_connected"}

    token = await get_valid_access_token(user.uid, "calendar")
    if not token:
        return {"events": [], "reason": "not_connected"}

    params = {
        "timeMin": time_min,
        "timeMax": time_max,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": "250",
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        r = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Google Calendar API error.")

    items = r.json().get("items") or []
    events: list[GoogleCalendarEventOut] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        parsed = _parse_google_event(item)
        if parsed:
            events.append(parsed)

    return {"events": [event.model_dump(by_alias=True) for event in events]}


@router.post("/calendar/events")
async def sync_calendar_events(
    body: SyncEventsBody,
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not is_connected(user.uid, "calendar"):
        return {"synced": False, "created": 0, "reason": "not_connected"}

    token = await get_valid_access_token(user.uid, "calendar")
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
