"""Read APIs for connected third-party services."""
from __future__ import annotations

from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.connectors.registry import connector_configured
from app.connectors.tokens import connection_account_label, get_valid_access_token
from app.connectors.user_store import get_connection, is_connected
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser, firestore_available

router = APIRouter(prefix="/api/connectors", tags=["connectors"])


class SpotifyPlayBody(BaseModel):
    query: str = Field(min_length=1, max_length=200)


class ConnectorStatusOut(BaseModel):
    connected: bool
    configured: bool
    storage_ready: bool = Field(alias="storageReady")
    account_label: Optional[str] = Field(default=None, alias="accountLabel")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


def _status(uid: str, connector_id: str) -> ConnectorStatusOut:
    entry = get_connection(uid, connector_id)
    return ConnectorStatusOut(
        connected=is_connected(uid, connector_id),
        configured=connector_configured(connector_id),
        storageReady=firestore_available(),
        accountLabel=connection_account_label(entry),
    )


async def _require_token(uid: str, connector_id: str) -> str:
    if not connector_configured(connector_id):
        raise HTTPException(400, f"Connector {connector_id} is not configured on the server.")
    if not is_connected(uid, connector_id):
        raise HTTPException(409, "not_connected")
    token = await get_valid_access_token(uid, connector_id)
    if not token:
        raise HTTPException(409, "not_connected")
    return token


@router.get("/gmail/status")
async def gmail_status(user: FirebaseUser = Depends(require_firebase_user)):
    return _status(user.uid, "gmail").model_dump(by_alias=True)


@router.get("/gmail/messages")
async def gmail_messages(
    max_results: int = Query(default=10, alias="maxResults", ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "gmail")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers={"Authorization": f"Bearer {token}"},
            params={"maxResults": max_results, "labelIds": "INBOX"},
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Gmail API error.")

    summaries: list[dict[str, Any]] = []
    for item in r.json().get("messages") or []:
        message_id = item.get("id")
        if not message_id:
            continue
        async with httpx.AsyncClient(timeout=25) as client:
            detail = await client.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}",
                headers={"Authorization": f"Bearer {token}"},
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
            )
        if detail.status_code != 200:
            continue
        payload = detail.json()
        headers = {
            h.get("name", "").lower(): h.get("value", "")
            for h in payload.get("payload", {}).get("headers", [])
            if isinstance(h, dict)
        }
        summaries.append(
            {
                "id": message_id,
                "subject": headers.get("subject") or "(Sans objet)",
                "from": headers.get("from") or "",
                "date": headers.get("date") or "",
                "snippet": payload.get("snippet") or "",
            }
        )

    return {"messages": summaries}


@router.get("/outlook/status")
async def outlook_status(user: FirebaseUser = Depends(require_firebase_user)):
    return _status(user.uid, "outlook").model_dump(by_alias=True)


@router.get("/outlook/messages")
async def outlook_messages(
    max_results: int = Query(default=10, alias="maxResults", ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "outlook")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://graph.microsoft.com/v1.0/me/messages",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "$top": max_results,
                "$select": "id,subject,from,receivedDateTime,bodyPreview",
                "$orderby": "receivedDateTime desc",
            },
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Microsoft Graph error.")

    messages = []
    for item in r.json().get("value") or []:
        if not isinstance(item, dict):
            continue
        sender = item.get("from") or {}
        email = sender.get("emailAddress") or {}
        messages.append(
            {
                "id": item.get("id"),
                "subject": item.get("subject") or "(Sans objet)",
                "from": email.get("name") or email.get("address") or "",
                "date": item.get("receivedDateTime") or "",
                "snippet": item.get("bodyPreview") or "",
            }
        )
    return {"messages": messages}


@router.get("/notion/status")
async def notion_status(user: FirebaseUser = Depends(require_firebase_user)):
    return _status(user.uid, "notion").model_dump(by_alias=True)


@router.get("/notion/search")
async def notion_search(
    q: str = Query(default=""),
    page_size: int = Query(default=10, alias="pageSize", ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "notion")
    body: dict[str, Any] = {"page_size": page_size}
    if q.strip():
        body["query"] = q.strip()
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.post(
            "https://api.notion.com/v1/search",
            headers={
                "Authorization": f"Bearer {token}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            json=body,
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Notion API error.")

    results = []
    for item in r.json().get("results") or []:
        if not isinstance(item, dict):
            continue
        title_parts: list[str] = []
        props = item.get("properties") or {}
        title_prop = props.get("title") or props.get("Name") or {}
        if isinstance(title_prop, dict):
            for part in title_prop.get("title") or []:
                plain = part.get("plain_text")
                if plain:
                    title_parts.append(str(plain))
        results.append(
            {
                "id": item.get("id"),
                "type": item.get("object"),
                "title": "".join(title_parts) or item.get("url") or "Sans titre",
                "url": item.get("url") or "",
            }
        )
    return {"results": results}


@router.get("/figma/status")
async def figma_status(user: FirebaseUser = Depends(require_firebase_user)):
    return _status(user.uid, "figma").model_dump(by_alias=True)


@router.get("/figma/me")
async def figma_me(user: FirebaseUser = Depends(require_firebase_user)):
    token = await _require_token(user.uid, "figma")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://api.figma.com/v1/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Figma API error.")
    data = r.json()
    return {
        "id": data.get("id"),
        "email": data.get("email"),
        "handle": data.get("handle"),
    }


@router.get("/figma/files")
async def figma_files(
    max_results: int = Query(default=10, alias="maxResults", ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    import os

    token = await _require_token(user.uid, "figma")
    team_id = os.getenv("FIGMA_TEAM_ID", "").strip()

    profile: dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=25) as client:
        me_r = await client.get(
            "https://api.figma.com/v1/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    if me_r.status_code == 200:
        data = me_r.json()
        profile = {
            "id": data.get("id"),
            "email": data.get("email"),
            "handle": data.get("handle"),
        }

    if not team_id:
        return {
            "files": [],
            "profile": profile,
            "hint": "Ajoutez FIGMA_TEAM_ID dans backend/.env pour lister les fichiers Figma.",
        }

    files: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=25) as client:
        projects_r = await client.get(
            f"https://api.figma.com/v1/teams/{team_id}/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
    if projects_r.status_code != 200:
        raise HTTPException(projects_r.status_code, projects_r.text or "Figma projects error.")

    async with httpx.AsyncClient(timeout=25) as client:
        for project in projects_r.json().get("projects") or []:
            if not isinstance(project, dict):
                continue
            project_id = project.get("id")
            if not project_id:
                continue
            files_r = await client.get(
                f"https://api.figma.com/v1/projects/{project_id}/files",
                headers={"Authorization": f"Bearer {token}"},
            )
            if files_r.status_code != 200:
                continue
            for item in files_r.json().get("files") or []:
                if not isinstance(item, dict):
                    continue
                files.append(
                    {
                        "key": item.get("key"),
                        "name": item.get("name") or "Sans titre",
                        "lastModified": item.get("last_modified") or "",
                        "projectName": project.get("name") or "",
                    }
                )
                if len(files) >= max_results:
                    break
            if len(files) >= max_results:
                break

    return {"files": files[:max_results]}


def _spotify_track_summary(item: dict[str, Any]) -> dict[str, Any] | None:
    track = item.get("item") if isinstance(item.get("item"), dict) else item
    if not isinstance(track, dict):
        return None
    artists = track.get("artists") or []
    artist_names = ", ".join(
        str(a.get("name"))
        for a in artists
        if isinstance(a, dict) and a.get("name")
    )
    album = track.get("album") if isinstance(track.get("album"), dict) else {}
    external = track.get("external_urls") if isinstance(track.get("external_urls"), dict) else {}
    return {
        "id": track.get("id"),
        "name": track.get("name") or "Sans titre",
        "artists": artist_names,
        "album": album.get("name") or "",
        "url": external.get("spotify") or "",
        "durationMs": track.get("duration_ms"),
    }


@router.get("/spotify/status")
async def spotify_status(user: FirebaseUser = Depends(require_firebase_user)):
    return _status(user.uid, "spotify").model_dump(by_alias=True)


@router.get("/spotify/playback")
async def spotify_playback(user: FirebaseUser = Depends(require_firebase_user)):
    token = await _require_token(user.uid, "spotify")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://api.spotify.com/v1/me/player",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code == 204:
        return {"playing": False, "track": None, "device": None}
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Spotify API error.")
    data = r.json()
    device = data.get("device") if isinstance(data.get("device"), dict) else {}
    track = _spotify_track_summary(data)
    return {
        "playing": bool(data.get("is_playing")),
        "track": track,
        "device": device.get("name") or None,
        "progressMs": data.get("progress_ms"),
    }


@router.get("/spotify/me")
async def spotify_me(user: FirebaseUser = Depends(require_firebase_user)):
    token = await _require_token(user.uid, "spotify")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Spotify API error.")
    data = r.json()
    return {
        "id": data.get("id"),
        "email": data.get("email"),
        "displayName": data.get("display_name"),
        "product": data.get("product"),
    }


def _spotify_track_card(track: dict[str, Any]) -> dict[str, Any]:
    artists = track.get("artists") or []
    artist_names = ", ".join(
        str(a.get("name"))
        for a in artists
        if isinstance(a, dict) and a.get("name")
    )
    album = track.get("album") if isinstance(track.get("album"), dict) else {}
    images = album.get("images") if isinstance(album.get("images"), list) else []
    image_url = None
    if images:
        image_url = images[min(1, len(images) - 1)].get("url") if isinstance(images[0], dict) else None
    external = track.get("external_urls") if isinstance(track.get("external_urls"), dict) else {}
    return {
        "id": track.get("id"),
        "name": track.get("name") or "Sans titre",
        "artists": artist_names,
        "album": album.get("name") or "",
        "imageUrl": image_url,
        "url": external.get("spotify") or "",
    }


@router.post("/spotify/play")
async def spotify_play(
    body: SpotifyPlayBody,
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    query = body.query.strip()
    async with httpx.AsyncClient(timeout=25) as client:
        search_r = await client.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query, "type": "track", "limit": 1},
        )
    if search_r.status_code != 200:
        raise HTTPException(search_r.status_code, search_r.text or "Spotify search error.")

    items = search_r.json().get("tracks", {}).get("items") or []
    if not items or not isinstance(items[0], dict):
        raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")

    track = items[0]
    track_id = track.get("id")
    if not track_id:
        raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")

    uri = f"spotify:track:{track_id}"
    async with httpx.AsyncClient(timeout=25) as client:
        play_r = await client.put(
            "https://api.spotify.com/v1/me/player/play",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"uris": [uri]},
        )

    if play_r.status_code == 404:
        raise HTTPException(
            409,
            "Aucun appareil Spotify actif. Ouvrez Spotify sur votre téléphone, ordinateur ou navigateur.",
        )
    if play_r.status_code == 403:
        raise HTTPException(
            403,
            "Le contrôle à distance Spotify nécessite un compte Premium.",
        )
    if play_r.status_code not in (200, 204):
        raise HTTPException(play_r.status_code, play_r.text or "Impossible de lancer la lecture.")

    card = _spotify_track_card(track)
    return {"playing": True, "track": card, "device": None}
