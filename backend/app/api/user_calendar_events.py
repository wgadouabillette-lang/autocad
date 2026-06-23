"""Persist in-app calendar blocks in Firestore and sync to Google / Outlook."""
from __future__ import annotations

import logging
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from starlette.concurrency import run_in_threadpool

from app.api.calendar_sync import CalendarEventInput, _create_google_event
from app.api.outlook_calendar_sync import _create_outlook_event
from app.calendar.event_store import (
    delete_event,
    list_events,
    purge_expired,
    save_events,
)
from app.connectors.tokens import get_valid_access_token
from app.connectors.user_store import is_connected_from_items, load_all_connections
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


class UserCalendarEventOut(BaseModel):
    id: str
    title: str
    detail: Optional[str] = None
    date_key: str = Field(alias="dateKey")
    start_minutes: int = Field(alias="startMinutes")
    end_minutes: int = Field(alias="endMinutes")
    source: str = "user"
    google_event_id: Optional[str] = Field(default=None, alias="googleEventId")
    outlook_event_id: Optional[str] = Field(default=None, alias="outlookEventId")
    ends_at: float = Field(alias="endsAt")
    created_at: float = Field(alias="createdAt")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


class CreateUserCalendarEventsBody(BaseModel):
    events: List[CalendarEventInput]
    source: str = "user"


async def _delete_google_event(uid: str, event_id: str) -> None:
    connections = await run_in_threadpool(load_all_connections, uid)
    if not is_connected_from_items(connections, "calendar"):
        return
    token = await get_valid_access_token(uid, "calendar")
    if not token:
        return
    async with httpx.AsyncClient(timeout=20.0) as client:
        await client.delete(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}",
            headers={"Authorization": f"Bearer {token}"},
        )


async def _delete_outlook_event(uid: str, event_id: str) -> None:
    connections = await run_in_threadpool(load_all_connections, uid)
    if not is_connected_from_items(connections, "outlook"):
        return
    token = await get_valid_access_token(uid, "outlook")
    if not token:
        return
    async with httpx.AsyncClient(timeout=20.0) as client:
        await client.delete(
            f"https://graph.microsoft.com/v1.0/me/events/{event_id}",
            headers={"Authorization": f"Bearer {token}"},
        )


async def _purge_remote(uid: str, events: list[dict]) -> None:
    for event in events:
        google_id = event.get("googleEventId")
        outlook_id = event.get("outlookEventId")
        if google_id:
            try:
                await _delete_google_event(uid, str(google_id))
            except Exception as exc:
                logger.warning("Failed to delete Google event %s: %s", google_id, exc)
        if outlook_id:
            try:
                await _delete_outlook_event(uid, str(outlook_id))
            except Exception as exc:
                logger.warning("Failed to delete Outlook event %s: %s", outlook_id, exc)


def _serialize(event: dict) -> dict:
    return UserCalendarEventOut(
        id=str(event["id"]),
        title=str(event["title"]),
        detail=event.get("detail"),
        dateKey=str(event["dateKey"]),
        startMinutes=int(event["startMinutes"]),
        endMinutes=int(event["endMinutes"]),
        source=str(event.get("source") or "user"),
        googleEventId=event.get("googleEventId"),
        outlookEventId=event.get("outlookEventId"),
        endsAt=float(event.get("endsAt") or 0),
        createdAt=float(event.get("createdAt") or 0),
    ).model_dump(by_alias=True)


@router.get("/user-events")
async def get_user_calendar_events(user: FirebaseUser = Depends(require_firebase_user)):
    expired = await run_in_threadpool(purge_expired, user.uid)
    if expired:
        await _purge_remote(user.uid, expired)
    events = await run_in_threadpool(list_events, user.uid)
    return {"events": [_serialize(event) for event in events]}


@router.post("/user-events")
async def create_user_calendar_events(
    body: CreateUserCalendarEventsBody,
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not body.events:
        return {"events": []}

    connections = await run_in_threadpool(load_all_connections, user.uid)
    prepared: list[dict] = []
    for item in body.events:
        event: dict = {
            "title": item.title,
            "detail": item.detail,
            "dateKey": item.date_key,
            "startMinutes": item.start_minutes,
            "endMinutes": item.end_minutes,
            "source": body.source,
        }

        if is_connected_from_items(connections, "calendar"):
            token = await get_valid_access_token(user.uid, "calendar")
            if token:
                google_id = await _create_google_event(token, item)
                if google_id:
                    event["googleEventId"] = google_id

        if is_connected_from_items(connections, "outlook"):
            token = await get_valid_access_token(user.uid, "outlook")
            if token:
                outlook_id = await _create_outlook_event(token, item)
                if outlook_id:
                    event["outlookEventId"] = outlook_id

        prepared.append(event)

    saved = await run_in_threadpool(save_events, user.uid, prepared)
    return {"events": [_serialize(event) for event in saved]}


@router.delete("/user-events/{event_id}")
async def delete_user_calendar_event(
    event_id: str,
    user: FirebaseUser = Depends(require_firebase_user),
):
    removed = await run_in_threadpool(delete_event, user.uid, event_id.strip())
    if removed is None:
        raise HTTPException(404, "Event not found.")
    await _purge_remote(user.uid, [removed])
    return {"ok": True, "id": event_id}
