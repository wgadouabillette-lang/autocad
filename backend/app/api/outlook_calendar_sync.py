"""Sync in-app calendar events with Outlook (Microsoft Graph)."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.api.calendar_sync import CalendarEventInput, SyncEventsBody, _event_datetimes
from app.connectors.registry import connector_configured
from app.connectors.tokens import connection_account_label, get_valid_access_token
from app.connectors.user_store import get_connection, is_connected
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


class OutlookCalendarEventOut(BaseModel):
    id: str
    title: str
    detail: Optional[str] = None
    date_key: str = Field(alias="dateKey")
    start_minutes: int = Field(alias="startMinutes")
    end_minutes: int = Field(alias="endMinutes")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


class OutlookCalendarStatusOut(BaseModel):
    connected: bool
    configured: bool
    account_email: Optional[str] = Field(default=None, alias="accountEmail")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


def _minutes_from_outlook_datetime(value: dict[str, Any]) -> tuple[str, int, int] | None:
    raw = value.get("dateTime")
    if not raw:
        if value.get("date"):
            date_key = str(value["date"])
            return date_key, 9 * 60, 10 * 60
        return None
    dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.now().astimezone().tzinfo)
    local = dt.astimezone()
    date_key = local.strftime("%Y-%m-%d")
    start_minutes = local.hour * 60 + local.minute
    return date_key, start_minutes, start_minutes + 30


def _parse_outlook_event(item: dict[str, Any]) -> OutlookCalendarEventOut | None:
    event_id = str(item.get("id") or "").strip()
    if not event_id:
        return None

    start_raw = item.get("start") or {}
    end_raw = item.get("end") or {}
    start_parsed = _minutes_from_outlook_datetime(start_raw)
    if not start_parsed:
        return None
    date_key, start_minutes, default_end = start_parsed

    end_minutes = default_end
    end_parsed = _minutes_from_outlook_datetime(end_raw)
    if end_parsed and end_parsed[0] == date_key:
        end_minutes = max(end_parsed[1], start_minutes + 15)
    elif end_parsed and end_parsed[0] != date_key:
        end_minutes = 24 * 60

    title = str(item.get("subject") or "Sans titre").strip() or "Sans titre"
    detail = str(item.get("bodyPreview") or "").strip() or None

    return OutlookCalendarEventOut(
        id=event_id,
        title=title,
        detail=detail,
        dateKey=date_key,
        startMinutes=start_minutes,
        endMinutes=end_minutes,
    )


async def _create_outlook_event(token: str, item: CalendarEventInput) -> bool:
    start, end, tz_name = _event_datetimes(item)
    body: dict[str, Any] = {
        "subject": item.title,
        "body": {"contentType": "text", "content": item.detail or ""},
        "start": {"dateTime": start, "timeZone": tz_name},
        "end": {"dateTime": end, "timeZone": tz_name},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            "https://graph.microsoft.com/v1.0/me/events",
            headers={"Authorization": f"Bearer {token}"},
            json=body,
        )
    return r.status_code in {200, 201}


@router.get("/outlook/calendar/status")
async def outlook_calendar_status(user: FirebaseUser = Depends(require_firebase_user)):
    configured = connector_configured("outlook")
    connected = configured and is_connected(user.uid, "outlook")
    account_email = connection_account_label(get_connection(user.uid, "outlook"))
    return OutlookCalendarStatusOut(
        connected=connected,
        configured=configured,
        accountEmail=account_email,
    )


@router.get("/outlook/calendar/events")
async def list_outlook_calendar_events(
    time_min: str = Query(..., alias="timeMin"),
    time_max: str = Query(..., alias="timeMax"),
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not connector_configured("outlook"):
        raise HTTPException(400, "Outlook OAuth is not configured on the server.")
    if not is_connected(user.uid, "outlook"):
        return {"events": [], "reason": "not_connected"}

    token = await get_valid_access_token(user.uid, "outlook")
    if not token:
        return {"events": [], "reason": "not_connected"}

    params = {
        "startDateTime": time_min,
        "endDateTime": time_max,
        "$top": "250",
        "$orderby": "start/dateTime",
        "$select": "id,subject,bodyPreview,start,end",
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        r = await client.get(
            "https://graph.microsoft.com/v1.0/me/calendarView",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Microsoft Graph calendar error.")

    events: list[OutlookCalendarEventOut] = []
    for item in r.json().get("value") or []:
        if not isinstance(item, dict):
            continue
        parsed = _parse_outlook_event(item)
        if parsed:
            events.append(parsed)

    return {"events": [event.model_dump(by_alias=True) for event in events]}


@router.post("/outlook/calendar/events")
async def sync_outlook_calendar_events(
    body: SyncEventsBody,
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not is_connected(user.uid, "outlook"):
        return {"synced": False, "created": 0, "reason": "not_connected"}

    token = await get_valid_access_token(user.uid, "outlook")
    if not token:
        return {"synced": False, "created": 0, "reason": "not_connected"}

    created = 0
    for item in body.events:
        try:
            if await _create_outlook_event(token, item):
                created += 1
        except Exception:  # noqa: BLE001
            continue

    return {
        "synced": created > 0,
        "created": created,
        "reason": None if created else "outlook_api_error",
    }
