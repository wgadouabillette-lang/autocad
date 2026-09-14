"""Live-notes STT — Whisper / Grok chunks for Electron (Web Speech is broken there)."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.ai.stt import SttError, transcribe_audio
from app.core.auth_deps import require_firebase_user
from app.core.firebase import FirebaseUser

router = APIRouter(prefix="/api", tags=["transcribe"])

_MAX_AUDIO_BYTES = 4 * 1024 * 1024
_SAFE_NAME = re.compile(r"^[\w.-]+\.(webm|wav|mp3|mp4|m4a|ogg|mpeg|mpga)$", re.I)


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

    filename = _filename(file)
    mime = file.content_type or "application/octet-stream"

    try:
        text = await transcribe_audio(
            data,
            filename=filename,
            mime=mime,
            uid=user.uid,
        )
    except SttError as exc:
        raise HTTPException(503, str(exc)) from exc

    return {"text": text}
