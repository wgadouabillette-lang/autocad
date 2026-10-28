"""Read APIs for connected third-party services."""
from __future__ import annotations

import base64
import random
import re
import time
from datetime import datetime, timezone
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.connectors.registry import connector_configured
from app.connectors.tokens import connection_account_label, get_valid_access_token
from app.connectors.user_store import get_connection, is_connected
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser, firestore_available

router = APIRouter(prefix="/api/connectors", tags=["connectors"])

_SPOTIFY_ME_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_SPOTIFY_ME_TTL_SEC = 300.0

GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
MAX_GMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


class GmailAttachmentIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", alias="mimeType", max_length=128)
    content_base64: str = Field(alias="contentBase64", min_length=1)

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)

    @field_validator("filename")
    @classmethod
    def sanitize_filename(cls, value: str) -> str:
        cleaned = re.sub(r"[^\w.\- ]", "_", value.strip())
        if not cleaned:
            raise ValueError("filename required")
        return cleaned[:255]


class GmailSendBody(BaseModel):
    to: list[str] = Field(min_length=1, max_length=25)
    subject: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=50000)
    body_html: bool = Field(default=False, alias="bodyHtml")
    attachments: list[GmailAttachmentIn] = Field(default_factory=list, max_length=10)

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)

    @field_validator("to")
    @classmethod
    def validate_recipients(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for raw in values:
            email = raw.strip().lower()
            if not email or email in seen:
                continue
            if not EMAIL_RE.match(email):
                raise ValueError(f"invalid email: {raw}")
            seen.add(email)
            out.append(email)
        if not out:
            raise ValueError("at least one recipient required")
        return out


class GmailSendOut(BaseModel):
    ok: bool
    message_id: Optional[str] = Field(default=None, alias="messageId")
    recipients: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


def _connection_has_gmail_send_scope(entry: dict[str, Any] | None) -> bool:
    if not entry:
        return False
    scope = str(entry.get("scope") or "")
    return "gmail.send" in scope or GMAIL_SEND_SCOPE in scope


def _build_gmail_raw_message(body: GmailSendBody) -> str:
    msg = MIMEMultipart()
    msg["To"] = ", ".join(body.to)
    msg["Subject"] = body.subject.strip() or "(Sans objet)"

    subtype = "html" if body.body_html else "plain"
    msg.attach(MIMEText(body.body or "", subtype, "utf-8"))

    total_bytes = 0
    for attachment in body.attachments:
        try:
            raw = base64.b64decode(attachment.content_base64, validate=True)
        except Exception:
            raise HTTPException(400, f"Invalid attachment encoding: {attachment.filename}")
        total_bytes += len(raw)
        if total_bytes > MAX_GMAIL_ATTACHMENT_BYTES:
            raise HTTPException(400, "Attachments exceed 10 MB total limit.")
        part = MIMEBase("application", "octet-stream")
        part.set_payload(raw)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={attachment.filename}")
        if attachment.mime_type:
            part.add_header("Content-Type", attachment.mime_type)
        msg.attach(part)

    encoded = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
    return encoded.rstrip("=")


async def _send_gmail_message(token: str, raw_message: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=45) as client:
        r = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"raw": raw_message},
        )
    if r.status_code == 403:
        detail = r.text or ""
        detail_l = detail.lower()
        if "has not been used" in detail_l or "accessnotconfigured" in detail_l or "it is disabled" in detail_l:
            raise HTTPException(
                403,
                "Gmail API is disabled on the Google Cloud project that owns GOOGLE_CLIENT_ID. "
                "Enable Gmail API for that project (APIs & Services → Library → Gmail API), "
                "or move the OAuth client to forma-cad-dev.",
            )
        if "insufficient" in detail_l or "auth/gmail.send" in detail_l:
            raise HTTPException(403, "gmail_send_scope_required")
        raise HTTPException(403, detail or "Gmail send permission denied.")
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text or "Gmail API error.")
    data = r.json()
    if not isinstance(data, dict):
        raise HTTPException(500, "Unexpected Gmail API response.")
    return data


class SpotifyPlayBody(BaseModel):
    query: str = Field(default="", max_length=200)
    track_id: Optional[str] = Field(default=None, alias="trackId", max_length=64)

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


class ConnectorStatusOut(BaseModel):
    connected: bool
    configured: bool
    storage_ready: bool = Field(alias="storageReady")
    account_label: Optional[str] = Field(default=None, alias="accountLabel")
    can_send: bool = Field(default=False, alias="canSend")

    model_config = ConfigDict(populate_by_name=True, populate_by_alias=True)


def _spotify_api_error_message(status_code: int, body: str) -> str:
    text = (body or "").strip()
    lowered = text.lower()
    if status_code == 403 and "premium subscription required for the owner" in lowered:
        return (
            "Spotify bloque l'API : le compte qui possède l'application sur "
            "developer.spotify.com doit avoir Spotify Premium actif "
            "(compte propriétaire de SPOTIFY_CLIENT_ID, pas votre forfait Meetra). "
            "Après activation, la propagation peut prendre quelques heures."
        )
    return text or "Erreur API Spotify."


# Fallback artist seeds when recommendations API is unavailable and user has no history.
_SPOTIFY_GENRE_ARTIST_SEEDS: dict[str, tuple[str, ...]] = {
    "pop": ("Taylor Swift", "Dua Lipa", "The Weeknd", "Ariana Grande"),
    "country": ("Luke Combs", "Morgan Wallen", "Chris Stapleton", "Carrie Underwood"),
    "rock": ("Foo Fighters", "Arctic Monkeys", "Red Hot Chili Peppers", "Coldplay"),
    "hip-hop": ("Drake", "Kendrick Lamar", "Travis Scott", "J. Cole"),
    "r-n-b": ("SZA", "The Weeknd", "Frank Ocean", "H.E.R."),
    "electronic": ("Calvin Harris", "Disclosure", "Fred again..", "Daft Punk"),
    "indie": ("Arctic Monkeys", "Tame Impala", "The Strokes", "Phoenix"),
    "jazz": ("Miles Davis", "John Coltrane", "Norah Jones", "Kamasi Washington"),
    "classical": ("Ludovico Einaudi", "Yo-Yo Ma", "Max Richter", "Hans Zimmer"),
    "latin": ("Bad Bunny", "Shakira", "Rosalía", "J Balvin"),
    "metal": ("Metallica", "Slipknot", "Ghost", "Gojira"),
    "blues": ("B.B. King", "Gary Clark Jr.", "Joe Bonamassa", "Stevie Ray Vaughan"),
    "folk": ("Bon Iver", "Mumford & Sons", "Fleet Foxes", "The Lumineers"),
    "soul": ("Alicia Keys", "Leon Bridges", "Sam Cooke", "Amy Winehouse"),
    "reggae": ("Bob Marley", "Damian Marley", "Koffee", "Sean Paul"),
}


# Spotify Feb 2026: search limit max dropped from 50 → 10.
_SPOTIFY_SEARCH_LIMIT_MAX = 10


async def _spotify_search_tracks(
    token: str,
    query: str,
    *,
    limit: int = 8,
    offset: int = 0,
    raise_on_error: bool = True,
) -> list[dict[str, Any]]:
    trimmed = query.strip()
    if not trimmed:
        return []
    # Do not send market=from_token: country was removed from /me (Feb 2026) and
    # that special value now fails or yields empty results. With a user token,
    # Spotify still applies the account's market when market is omitted.
    async with httpx.AsyncClient(timeout=25) as client:
        search_r = await client.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "q": trimmed,
                "type": "track",
                "limit": max(1, min(limit, _SPOTIFY_SEARCH_LIMIT_MAX)),
                "offset": max(0, min(offset, 1000)),
            },
        )
    if search_r.status_code != 200:
        if raise_on_error:
            raise HTTPException(
                search_r.status_code,
                _spotify_api_error_message(search_r.status_code, search_r.text),
            )
        return []
    items = search_r.json().get("tracks", {}).get("items") or []
    return [_spotify_track_card(item) for item in items if isinstance(item, dict)]


def _dedupe_spotify_track_cards(
    tracks: list[dict[str, Any]],
    *,
    seen: set[str] | None = None,
) -> list[dict[str, Any]]:
    ids = seen if seen is not None else set()
    out: list[dict[str, Any]] = []
    for track in tracks:
        track_id = str(track.get("id") or "").strip()
        fallback = f"{track.get('name')}::{track.get('artists')}"
        key = track_id or fallback
        if key in ids:
            continue
        ids.add(key)
        out.append(track)
    return out


async def _spotify_genre_only_tracks(
    token: str,
    genre: str,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Tracks for an explicit style. Listening history is not mixed in."""
    collected: list[dict[str, Any]] = []
    seen: set[str] = set()

    def absorb(items: list[dict[str, Any]]) -> None:
        nonlocal collected
        for track in _dedupe_spotify_track_cards(items, seen=seen):
            collected.append(track)
            if len(collected) >= limit:
                break

    artist_pool = list(
        _SPOTIFY_GENRE_ARTIST_SEEDS.get(genre, _SPOTIFY_GENRE_ARTIST_SEEDS["pop"])
    )
    random.shuffle(artist_pool)
    for artist_name in artist_pool:
        if len(collected) >= limit:
            break
        absorb(
            await _spotify_search_tracks(
                token,
                f'artist:"{artist_name}"',
                limit=5,
                raise_on_error=False,
            )
        )

    if len(collected) < limit:
        for query in (f"genre:{genre}", f"{genre} hits"):
            if len(collected) >= limit:
                break
            absorb(
                await _spotify_search_tracks(
                    token,
                    query,
                    limit=min(limit, _SPOTIFY_SEARCH_LIMIT_MAX),
                    raise_on_error=False,
                )
            )

    return collected[:limit]


async def _spotify_discovery_tracks(
    token: str,
    *,
    seed_genres: list[str],
    seed_track_ids: list[str],
    limit: int,
) -> list[dict[str, Any]]:
    """Discover tracks via search + top artists/tracks (replaces deprecated recommendations API)."""
    genre = seed_genres[0] if seed_genres else "pop"
    if genre != "pop":
        return await _spotify_genre_only_tracks(token, genre, limit=limit)
    collected: list[dict[str, Any]] = []
    seen: set[str] = set()

    def absorb(items: list[dict[str, Any]]) -> None:
        nonlocal collected
        for track in _dedupe_spotify_track_cards(items, seen=seen):
            collected.append(track)
            if len(collected) >= limit:
                break

    for track_id in seed_track_ids[:3]:
        if len(collected) >= limit:
            break
        try:
            track = await _fetch_spotify_track(token, track_id)
        except HTTPException:
            continue
        artists = track.get("artists") if isinstance(track.get("artists"), list) else []
        artist_name = None
        if artists and isinstance(artists[0], dict):
            artist_name = artists[0].get("name")
        if isinstance(artist_name, str) and artist_name.strip():
            absorb(
                await _spotify_search_tracks(
                    token,
                    f'artist:"{artist_name.strip()}"',
                    limit=6,
                    raise_on_error=False,
                )
            )

    async with httpx.AsyncClient(timeout=25) as client:
        top_artists_r = await client.get(
            "https://api.spotify.com/v1/me/top/artists",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": 5, "time_range": "short_term"},
        )
    if top_artists_r.status_code == 200:
        for artist in top_artists_r.json().get("items") or []:
            if len(collected) >= limit:
                break
            if not isinstance(artist, dict):
                continue
            name = artist.get("name")
            if isinstance(name, str) and name.strip():
                absorb(
                    await _spotify_search_tracks(
                        token,
                        f'artist:"{name.strip()}"',
                        limit=4,
                        raise_on_error=False,
                    )
                )

    async with httpx.AsyncClient(timeout=25) as client:
        top_tracks_r = await client.get(
            "https://api.spotify.com/v1/me/top/tracks",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": 10, "time_range": "short_term"},
        )
    if top_tracks_r.status_code == 200:
        top_items = top_tracks_r.json().get("items") or []
        absorb([_spotify_track_card(item) for item in top_items if isinstance(item, dict)])

    if len(collected) < limit:
        genre = seed_genres[0] if seed_genres else "pop"
        artist_pool = list(_SPOTIFY_GENRE_ARTIST_SEEDS.get(genre, _SPOTIFY_GENRE_ARTIST_SEEDS["pop"]))
        random.shuffle(artist_pool)
        for artist_name in artist_pool[:3]:
            if len(collected) >= limit:
                break
            absorb(
                await _spotify_search_tracks(
                    token,
                    f'artist:"{artist_name}"',
                    limit=5,
                    raise_on_error=False,
                )
            )

    if len(collected) < limit:
        year = datetime.now(timezone.utc).year
        absorb(
            await _spotify_search_tracks(
                token,
                f"year:{year}",
                limit=min(limit, _SPOTIFY_SEARCH_LIMIT_MAX),
                raise_on_error=False,
            )
        )

    return collected[:limit]


def _status(uid: str, connector_id: str) -> ConnectorStatusOut:
    entry = get_connection(uid, connector_id)
    configured = connector_configured(connector_id)
    can_send = connector_id == "gmail" and _connection_has_gmail_send_scope(entry)
    return ConnectorStatusOut(
        connected=configured and is_connected(uid, connector_id),
        configured=configured,
        storageReady=firestore_available(),
        accountLabel=connection_account_label(entry),
        canSend=can_send,
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


@router.post("/gmail/send")
async def gmail_send(
    body: GmailSendBody,
    user: FirebaseUser = Depends(require_firebase_user),
):
    entry = get_connection(user.uid, "gmail")
    if not connector_configured("gmail"):
        raise HTTPException(400, "Connector gmail is not configured on the server.")
    if not is_connected(user.uid, "gmail"):
        raise HTTPException(409, "not_connected")
    if not _connection_has_gmail_send_scope(entry):
        raise HTTPException(403, "gmail_send_scope_required")

    token = await get_valid_access_token(user.uid, "gmail")
    if not token:
        raise HTTPException(409, "not_connected")

    raw_message = _build_gmail_raw_message(body)
    result = await _send_gmail_message(token, raw_message)
    return GmailSendOut(
        ok=True,
        messageId=str(result.get("id") or "") or None,
        recipients=body.to,
    ).model_dump(by_alias=True)


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
        raise HTTPException(
            r.status_code,
            _spotify_api_error_message(r.status_code, r.text),
        )
    data = r.json()
    # email / product / country removed from /me in Spotify Feb 2026 API.
    return {
        "id": data.get("id"),
        "email": data.get("email"),
        "displayName": data.get("display_name"),
        "product": data.get("product"),
    }


def _spotify_has_streaming_scope(entry: dict[str, Any] | None) -> bool:
    scope = str((entry or {}).get("scope") or "")
    return "streaming" in scope.split()


@router.get("/spotify/player-config")
async def spotify_player_config(user: FirebaseUser = Depends(require_firebase_user)):
    import os

    client_id = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(400, "Spotify OAuth non configuré sur le backend.")
    token = await _require_token(user.uid, "spotify")
    entry = get_connection(user.uid, "spotify")
    has_streaming_scope = _spotify_has_streaming_scope(entry)

    now = time.time()
    cached = _SPOTIFY_ME_CACHE.get(user.uid)
    if cached and now - cached[0] < _SPOTIFY_ME_TTL_SEC:
        me = cached[1]
    else:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://api.spotify.com/v1/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code != 200:
            raise HTTPException(
                r.status_code,
                _spotify_api_error_message(r.status_code, r.text),
            )
        me = r.json()
        _SPOTIFY_ME_CACHE[user.uid] = (now, me)

    # product was removed from /me (Feb 2026). When absent, treat streaming scope
    # as Premium intent — Web Playback SDK still enforces Premium at play time.
    product = me.get("product")
    if isinstance(product, str) and product.strip():
        premium = product.strip().lower() == "premium"
    else:
        premium = has_streaming_scope
    return {
        "clientId": client_id,
        "premium": premium,
        "hasStreamingScope": has_streaming_scope,
        "reconnectRequired": premium and not has_streaming_scope,
    }


@router.get("/spotify/player-token")
async def spotify_player_token(user: FirebaseUser = Depends(require_firebase_user)):
    token = await _require_token(user.uid, "spotify")
    return {"accessToken": token}


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
    duration_ms = track.get("duration_ms")
    return {
        "id": track.get("id"),
        "name": track.get("name") or "Sans titre",
        "artists": artist_names,
        "album": album.get("name") or "",
        "imageUrl": image_url,
        "url": external.get("spotify") or "",
        "previewUrl": track.get("preview_url") or None,
        "durationMs": int(duration_ms) if isinstance(duration_ms, (int, float)) and duration_ms > 0 else None,
    }


@router.get("/spotify/search")
async def spotify_search(
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=8, ge=1, le=10),
    offset: int = Query(default=0, ge=0, le=1000),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    query = q.strip()
    tracks = await _spotify_search_tracks(token, query, limit=limit, offset=offset)
    if not tracks:
        raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")
    return {"tracks": tracks, "query": query}


@router.get("/spotify/recently-played")
async def spotify_recently_played(
    limit: int = Query(default=50, ge=1, le=50),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://api.spotify.com/v1/me/player/recently-played",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": limit},
        )
    if r.status_code in (401, 403):
        return {"tracks": [], "scopeMissing": True}
    if r.status_code != 200:
        raise HTTPException(
            r.status_code,
            _spotify_api_error_message(r.status_code, r.text),
        )
    items = r.json().get("items") or []
    tracks: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        track_raw = item.get("track")
        if not isinstance(track_raw, dict):
            continue
        card = _spotify_track_card(track_raw)
        played_at = item.get("played_at")
        if isinstance(played_at, str):
            card["playedAt"] = played_at
        tracks.append(card)
    return {"tracks": tracks}


@router.get("/spotify/recommendations")
async def spotify_recommendations(
    seed_genres: str = Query(default="", max_length=120),
    seed_tracks: str = Query(default="", max_length=200),
    limit: int = Query(default=12, ge=1, le=20),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    genres = [g.strip() for g in seed_genres.split(",") if g.strip()]
    track_ids = [t.strip() for t in seed_tracks.split(",") if t.strip()]
    tracks = await _spotify_discovery_tracks(
        token,
        seed_genres=genres or ["pop"],
        seed_track_ids=track_ids,
        limit=limit,
    )
    return {"tracks": tracks}


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


@router.get("/spotify/tracks/{track_id}/beat-grid")
async def spotify_beat_grid(
    track_id: str,
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "spotify")
    safe_id = track_id.strip()
    if not safe_id:
        raise HTTPException(400, "Identifiant de piste manquant.")
    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            f"https://api.spotify.com/v1/audio-analysis/{safe_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code == 404:
        async with httpx.AsyncClient(timeout=25) as client:
            features_r = await client.get(
                f"https://api.spotify.com/v1/audio-features/{safe_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
        tempo = None
        if features_r.status_code == 200 and isinstance(features_r.json(), dict):
            raw_tempo = features_r.json().get("tempo")
            if isinstance(raw_tempo, (int, float)):
                tempo = float(raw_tempo)
        return {"beats": [], "tempo": tempo}
    if r.status_code != 200:
        raise HTTPException(
            r.status_code,
            _spotify_api_error_message(r.status_code, r.text),
        )
    data = r.json()
    if not isinstance(data, dict):
        data = {}
    beats_raw = data.get("beats") or []
    beats: list[float] = []
    for entry in beats_raw:
        if isinstance(entry, dict) and isinstance(entry.get("start"), (int, float)):
            beats.append(float(entry["start"]))
    track_meta = data.get("track") if isinstance(data.get("track"), dict) else {}
    tempo = track_meta.get("tempo") if isinstance(track_meta.get("tempo"), (int, float)) else None
    return {"beats": beats, "tempo": tempo}


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
        items_cards = await _spotify_search_tracks(token, query, limit=1)
        if not items_cards:
            raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")

        track = items_cards[0]
        track_id = str(track.get("id") or "")
        if not track_id:
            raise HTTPException(404, "Aucune piste trouvée pour cette recherche.")

        async with httpx.AsyncClient(timeout=25) as client:
            track_r = await client.get(
                f"https://api.spotify.com/v1/tracks/{track_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if track_r.status_code != 200:
            raise HTTPException(
                track_r.status_code,
                _spotify_api_error_message(track_r.status_code, track_r.text),
            )
        track = track_r.json()

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


def _cloud_limit(limit: int) -> int:
    return max(1, min(limit, 25))


def _clean_cloud_query(raw: str) -> str:
    query = " ".join((raw or "").split())
    if not query:
        raise HTTPException(400, "Missing search query.")
    if len(query) > 120 or any(ch in query for ch in ("'", '"', "\\", "\n", "\r")):
        raise HTTPException(400, "Invalid search query.")
    return query


def _clean_cloud_path(raw: str | None) -> str:
    path = (raw or "").strip().replace("\\", "/")
    if path in {"", "/"}:
        return ""
    if not path.startswith("/"):
        path = f"/{path}"
    parts = [part for part in path.split("/") if part]
    if any(part in {".", ".."} for part in parts):
        raise HTTPException(400, "Invalid path.")
    if len(path) > 400:
        raise HTTPException(400, "Invalid path.")
    return "/" + "/".join(parts)


def _graph_drive_file(item: dict[str, Any]) -> dict[str, Any]:
    name = str(item.get("name") or "")
    parent = str((item.get("parentReference") or {}).get("path") or "")
    base = parent.split(":/", 1)[1] if ":/" in parent else ""
    path = f"/{base}/{name}" if base else f"/{name}"
    is_folder = isinstance(item.get("folder"), dict)
    return {
        "id": str(item.get("id") or ""),
        "name": name,
        "path": path.replace("//", "/"),
        "kind": "folder" if is_folder else "file",
        "size": item.get("size") if not is_folder else None,
        "modified": item.get("lastModifiedDateTime"),
        "url": item.get("webUrl"),
    }


def _dropbox_drive_file(entry: dict[str, Any]) -> dict[str, Any]:
    tag = str(entry.get(".tag") or "")
    is_folder = tag == "folder"
    return {
        "id": str(entry.get("id") or ""),
        "name": str(entry.get("name") or ""),
        "path": str(entry.get("path_display") or entry.get("path_lower") or ""),
        "kind": "folder" if is_folder else "file",
        "size": entry.get("size") if not is_folder else None,
        "modified": entry.get("client_modified") or entry.get("server_modified"),
        "url": None,
    }


def _dropbox_search_entry(match: dict[str, Any]) -> dict[str, Any] | None:
    metadata = match.get("metadata")
    if not isinstance(metadata, dict):
        return None
    inner = metadata.get("metadata")
    entry = inner if isinstance(inner, dict) else metadata
    if not isinstance(entry, dict) or not entry.get("name"):
        return None
    return _dropbox_drive_file(entry)


async def _cloud_api_json(
    method: str,
    url: str,
    token: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    content: bytes | None = None,
) -> Any:
    headers = {"Authorization": f"Bearer {token}"}
    if json_body is not None or content is not None:
        headers["Content-Type"] = "application/json"
    async with httpx.AsyncClient(timeout=25) as client:
        response = await client.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            content=content,
        )
    if response.status_code in {401, 403}:
        raise HTTPException(409, "not_connected")
    if response.status_code >= 400:
        detail = response.text[:300] or "Cloud API error."
        raise HTTPException(response.status_code, detail)
    if not response.content:
        return {}
    return response.json()


def _graph_children_url(folder: str) -> str:
    if not folder:
        return "https://graph.microsoft.com/v1.0/me/drive/root/children"
    from urllib.parse import quote

    encoded = quote(folder, safe="/")
    return f"https://graph.microsoft.com/v1.0/me/drive/root:{encoded}:/children"


@router.get("/onedrive/files")
async def onedrive_files(
    path: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "onedrive")
    capped = _cloud_limit(limit)
    data = await _cloud_api_json(
        "GET",
        _graph_children_url(_clean_cloud_path(path)),
        token,
        params={
            "$top": capped,
            "$select": "id,name,size,lastModifiedDateTime,folder,file,parentReference,webUrl",
        },
    )
    items = data.get("value") if isinstance(data, dict) else []
    files = [_graph_drive_file(item) for item in (items or []) if isinstance(item, dict)]
    return {"files": files[:capped]}


@router.get("/onedrive/search")
async def onedrive_search(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=20, ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "onedrive")
    query = _clean_cloud_query(q)
    capped = _cloud_limit(limit)
    url = f"https://graph.microsoft.com/v1.0/me/drive/root/search(q='{query}')"
    data = await _cloud_api_json(
        "GET",
        url,
        token,
        params={
            "$top": capped,
            "$select": "id,name,size,lastModifiedDateTime,folder,file,parentReference,webUrl",
        },
    )
    items = data.get("value") if isinstance(data, dict) else []
    files = [_graph_drive_file(item) for item in (items or []) if isinstance(item, dict)]
    return {"files": files[:capped]}


@router.get("/dropbox/files")
async def dropbox_files(
    path: str = Query(default=""),
    limit: int = Query(default=20, ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "dropbox")
    capped = _cloud_limit(limit)
    data = await _cloud_api_json(
        "POST",
        "https://api.dropboxapi.com/2/files/list_folder",
        token,
        json_body={
            "path": _clean_cloud_path(path),
            "limit": capped,
            "recursive": False,
        },
    )
    entries = data.get("entries") if isinstance(data, dict) else []
    files = [_dropbox_drive_file(entry) for entry in (entries or []) if isinstance(entry, dict)]
    return {"files": files[:capped]}


@router.get("/dropbox/search")
async def dropbox_search(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=20, ge=1, le=25),
    user: FirebaseUser = Depends(require_firebase_user),
):
    token = await _require_token(user.uid, "dropbox")
    query = _clean_cloud_query(q)
    capped = _cloud_limit(limit)
    data = await _cloud_api_json(
        "POST",
        "https://api.dropboxapi.com/2/files/search_v2",
        token,
        json_body={
            "query": query,
            "options": {"max_results": capped, "filename_only": True},
        },
    )
    matches = data.get("matches") if isinstance(data, dict) else []
    files: list[dict[str, Any]] = []
    for match in matches or []:
        if not isinstance(match, dict):
            continue
        file = _dropbox_search_entry(match)
        if file:
            files.append(file)
    return {"files": files[:capped]}
