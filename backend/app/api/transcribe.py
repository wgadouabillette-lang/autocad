"""Live-notes STT — Whisper chunks for Electron (Web Speech is broken there)."""
from __future__ import annotations

import os
import re

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser, load_user_api_keys

router = APIRouter(prefix="/api", tags=["transcribe"])

_MAX_AUDIO_BYTES = 4 * 1024 * 1024
_SAFE_NAME = re.compile(r"^[\w.-]+\.(webm|wav|mp3|mp4|m4a|ogg|mpeg|mpga)$", re.I)


def _openai_key(uid: str) -> str:
    try:
        user_keys = load_user_api_keys(uid)
        user_openai = (user_keys.get("openai") or "").strip()
        if user_openai:
            return user_openai
    except Exception:
        pass
    return (os.getenv("OPENAI_API_KEY") or "").strip()


def _filename(upload: UploadFile) -> str:
    name = (upload.filename or "").split("/")[-1].split("\\")[-1]
    if _SAFE_NAME.match(name):
        return name
    content = (upload.content_type or "").lower()
    if "wav" in content:
        return "chunk.wav"
    if "mp4" in content or "m4a" in content:
        return "chunk.m4a"
    if "ogg" in content:
        return "chunk.ogg"
    if "mpeg" in content or "mp3" in content:
        return "chunk.mp3"
    return "chunk.webm"


@router.post("/transcribe")
async def api_transcribe(
    file: UploadFile = File(...),
    user: FirebaseUser = Depends(require_firebase_user),
):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Audio vide.")
    if len(data) > _MAX_AUDIO_BYTES:
        raise HTTPException(413, "Audio trop volumineux.")

    api_key = _openai_key(user.uid)
    if not api_key:
        raise HTTPException(503, "Transcription indisponible (service).")

    filename = _filename(file)
    mime = file.content_type or "application/octet-stream"

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (filename, data, mime)},
                data={"model": "whisper-1"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Transcription indisponible (réseau).") from exc

    if response.status_code in {401, 403}:
        raise HTTPException(503, "Transcription indisponible (service).")
    if response.status_code >= 400:
        raise HTTPException(503, "Transcription indisponible (réseau).")

    payload = response.json()
    text = payload.get("text") if isinstance(payload, dict) else None
    return {"text": (text or "").strip() if isinstance(text, str) else ""}
