"""Live-notes / recap STT — OpenAI Whisper, then xAI Grok STT."""
from __future__ import annotations

import logging
import os
from typing import Literal, Optional

import httpx

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.firebase import load_user_api_keys

XAI_STT_URL = "https://api.x.ai/v1/stt"
OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions"


class SttError(Exception):
    def __init__(self, kind: Literal["service", "network"], message: str):
        super().__init__(message)
        self.kind = kind


def _trim(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def resolve_stt_keys(uid: Optional[str] = None) -> tuple[str, str]:
    openai = ""
    xai = ""
    if uid:
        try:
            user_keys = load_user_api_keys(uid)
            openai = _trim(user_keys.get("openai"))
            xai = _trim(user_keys.get("xai"))
        except Exception:
            pass
    if not openai:
        openai = _trim(os.getenv("OPENAI_API_KEY")) or _trim(settings.openai_api_key)
    if not xai:
        xai = _trim(os.getenv("XAI_API_KEY")) or _trim(settings.xai_api_key)
    return openai, xai


def _text_from_payload(payload: object) -> str:
    if not isinstance(payload, dict):
        return ""
    text = payload.get("text")
    return text.strip() if isinstance(text, str) else ""


async def _post_openai(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    data: bytes,
    filename: str,
    mime: str,
) -> httpx.Response:
    return await client.post(
        OPENAI_STT_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        files={"file": (filename, data, mime)},
        data={"model": "whisper-1"},
    )


async def _post_xai(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    data: bytes,
    filename: str,
    mime: str,
    include_model: bool = True,
) -> httpx.Response:
    form = {"language": "fr", "format": "true"}
    if include_model:
        form["model"] = "grok-stt"
    return await client.post(
        XAI_STT_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        data=form,
        files={"file": (filename, data, mime)},
    )


async def transcribe_audio(
    data: bytes,
    *,
    filename: str,
    mime: str,
    uid: Optional[str] = None,
    timeout: float = 45.0,
) -> str:
    openai_key, xai_key = resolve_stt_keys(uid)
    if not openai_key and not xai_key:
        raise SttError("service", "Transcription indisponible (service).")

    last_kind: Literal["service", "network"] = "network"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            attempts: list[tuple[str, object]] = []
            if xai_key:
                attempts.append(("xai", xai_key))
            if openai_key:
                attempts.append(("openai", openai_key))

            for provider, api_key in attempts:
                try:
                    response = (
                        await _post_openai(
                            client,
                            api_key=api_key,
                            data=data,
                            filename=filename,
                            mime=mime,
                        )
                        if provider == "openai"
                        else await _post_xai(
                            client,
                            api_key=api_key,
                            data=data,
                            filename=filename,
                            mime=mime,
                        )
                    )
                except httpx.HTTPError as exc:
                    last_kind = "network"
                    if provider == attempts[-1][0]:
                        raise SttError(
                            "network",
                            "Transcription indisponible (réseau).",
                        ) from exc
                    continue

                if response.status_code == 400 and provider == "xai":
                    response = await _post_xai(
                        client,
                        api_key=api_key,
                        data=data,
                        filename=filename,
                        mime=mime,
                        include_model=False,
                    )
                if response.status_code in {401, 403}:
                    last_kind = "service"
                    logger.warning("STT %s auth failed: %s", provider, response.text[:240])
                    continue
                if response.status_code >= 400:
                    last_kind = "network"
                    logger.warning(
                        "STT %s failed %s: %s",
                        provider,
                        response.status_code,
                        response.text[:240],
                    )
                    continue
                return _text_from_payload(response.json())
    except SttError:
        raise
    except Exception as exc:
        raise SttError("network", "Transcription indisponible (réseau).") from exc

    raise SttError(
        last_kind,
        "Transcription indisponible (service)."
        if last_kind == "service"
        else "Transcription indisponible (réseau).",
    )
