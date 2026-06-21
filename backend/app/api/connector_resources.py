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
    query: str = Field(default="", max_length=200)
    track_id: Optional[str] = Field(default=None, alias="trackId", max_length=64)

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


class ConnectorStatusOut(BaseModel):
    connected: bool
    configured: bool
    storage_ready: bool = Field(alias="storageReady")
    account_label: Optional[str] = Field(default=None, alias="accountLabel")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


def _spotify_api_error_message(status_code: int, body: str) -> str:
    text = (body or "").strip()
    lowered = text.lower()
    if status_code == 403 and "premium subscription required for the owner" in lowered:
        return (
            "Spotify bloque l'API : le compte qui possède l'application sur "
            "developer.spotify.com doit avoir Spotify Premium actif "
            "(compte propriétaire de SPOTIFY_CLIENT_ID, pas votre forfait Lyte). "
            "Après activation, la propagation peut prendre quelques heures."
        )
    return text or "Erreur API Spotify."


def _status(uid: str, connector_id: str) -> ConnectorStatusOut:
    entry = get_connection(uid, connector_id)
    configured = connector_configured(connector_id)
    return ConnectorStatusOut(
        connected=configured and is_connected(uid, connector_id),
        configured=configured,
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
        "previewUrl": track.get("preview_url") or None,
    }


@router.get("/spotify/search")
async def spotify_search(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=8, ge=1, le=20),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    query = q.strip()
    async with httpx.AsyncClient(timeout=25) as client:
        search_r = await client.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={"q": query, "type": "track", "limit": limit},
        )
    if search_r.status_code != 200:
        raise HTTPException(
            search_r.status_code,
            _spotify_api_error_message(search_r.status_code, search_r.text),
        )
    items = search_r.json().get("tracks", {}).get("items") or []
    tracks = [_spotify_track_card(item) for item in items if isinstance(item, dict)]
    return {"tracks": tracks, "query": query}


async def _fetch_spotify_track(token: str, track_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            f"https://api.spotify.com/v1/tracks/{track_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(
            r.status_code,
            _spotify_api_error_message(r.status_code, r.text),
        )
    data = r.json()
    if not isinstance(data, dict):
        raise HTTPException(404, "Piste introuvable.")
    return data


@router.post("/spotify/play")
async def spotify_play(
    body: SpotifyPlayBody,
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    track_id = (body.track_id or "").strip()
    query = body.query.strip()

    if track_id:
        track = await _fetch_spotify_track(token, track_id)
    else:
        if not query:
            raise HTTPException(400, "Indiquez une recherche ou un identifiant de piste.")
        async with httpx.AsyncClient(timeout=25) as client:
            search_r = await client.get(
                "https://api.spotify.com/v1/search",
                headers={"Authorization": f"Bearer {token}"},
                params={"q": query, "type": "track", "limit": 1},
            )
        if search_r.status_code != 200:
            raise HTTPException(
                search_r.status_code,
                _spotify_api_error_message(search_r.status_code, search_r.text),
            )

        items = search_r.json().get("tracks", {}).get("items") or []
        if not items or not isinstance(items[0], dict):
            raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")

        track = items[0]
        track_id = str(track.get("id") or "")
        if not track_id:
            raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")

    uri = f"spotify:track:{track_id}"
    async with httpx.AsyncClient(timeout=25) as client:
        play_r = await client.put(
            "https://api.spotify.com/v1/me/player/play",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"uris": [uri]},
        )

    card = _spotify_track_card(track)

    # Spotify exige Premium pour la lecture à distance et un device actif pour la cible.
    # Plutôt que d'échouer, on dégrade en renvoyant la carte cliquable : l'utilisateur
    # peut ouvrir le morceau dans son client Spotify (web/desktop) directement.
    if play_r.status_code == 403:
        return {
            "playing": False,
            "track": card,
            "device": None,
            "requiresPremium": True,
        }
    if play_r.status_code == 404:
        return {
            "playing": False,
            "track": card,
            "device": None,
            "requiresActiveDevice": True,
        }
    if play_r.status_code not in (200, 204):
        raise HTTPException(
            play_r.status_code,
            _spotify_api_error_message(play_r.status_code, play_r.text),
        )

    return {"playing": True, "track": card, "device": None}
