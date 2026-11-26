"""Live-notes / recap STT — xAI Grok STT, then OpenAI Whisper."""
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


# Whisper verbose_json names the language in English ("english"), not as an ISO code.
_WHISPER_LANGUAGE_CODES = {
    "afrikaans": "af",
    "arabic": "ar",
    "armenian": "hy",
    "azerbaijani": "az",
    "belarusian": "be",
    "bengali": "bn",
    "bosnian": "bs",
    "bulgarian": "bg",
    "catalan": "ca",
    "chinese": "zh",
    "croatian": "hr",
    "czech": "cs",
    "danish": "da",
    "dutch": "nl",
    "english": "en",
    "estonian": "et",
    "finnish": "fi",
    "french": "fr",
    "german": "de",
    "greek": "el",
    "hebrew": "he",
    "hindi": "hi",
    "hungarian": "hu",
    "indonesian": "id",
    "italian": "it",
    "japanese": "ja",
    "korean": "ko",
    "latvian": "lv",
    "lithuanian": "lt",
    "malay": "ms",
    "norwegian": "no",
    "persian": "fa",
    "polish": "pl",
    "portuguese": "pt",
    "romanian": "ro",
    "russian": "ru",
    "serbian": "sr",
    "slovak": "sk",
    "slovenian": "sl",
    "spanish": "es",
    "swedish": "sv",
    "thai": "th",
    "turkish": "tr",
    "ukrainian": "uk",
    "vietnamese": "vi",
}


def _detected_language(value: object) -> Optional[str]:
    raw = _trim(value).lower().replace("_", "-")
    if not raw:
        return None
    if raw in _WHISPER_LANGUAGE_CODES:
        return _WHISPER_LANGUAGE_CODES[raw]
    head = raw.split("-", 1)[0]
    if head in _WHISPER_LANGUAGE_CODES:
        return _WHISPER_LANGUAGE_CODES[head]
    if len(head) == 2 and head.isalpha():
        return head
    return None


def _text_and_language(payload: object) -> tuple[str, Optional[str]]:
    if isinstance(payload, str):
        return payload.strip(), None
    if not isinstance(payload, dict):
        return "", None
    text = payload.get("text")
    spoken = _detected_language(payload.get("language"))
    return (text.strip() if isinstance(text, str) else ""), spoken


def _language_code(value: Optional[str]) -> Optional[str]:
    """ISO-639-1 when the client sent one. Empty means the provider detects it."""
    raw = _trim(value).lower()
    if len(raw) >= 2 and raw[:2].isalpha():
        return raw[:2]
    return None


def _prompt_text(value: Optional[str]) -> str:
    text = _trim(value).replace("\n", " ")
    return text[-200:]


async def _post_openai(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    data: bytes,
    filename: str,
    mime: str,
    language: Optional[str],
    prompt: str,
) -> httpx.Response:
    form: dict[str, str] = {"model": "whisper-1", "temperature": "0"}
    if language:
        form["language"] = language
    else:
        # Language name comes back with the transcript so the session can stay monolingual.
        form["response_format"] = "verbose_json"
    if prompt:
        form["prompt"] = prompt
    return await client.post(
        OPENAI_STT_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        files={"file": (filename, data, mime)},
        data=form,
    )


async def _post_xai(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    data: bytes,
    filename: str,
    mime: str,
    language: Optional[str],
    include_model: bool = True,
) -> httpx.Response:
    form: dict[str, str] = {}
    # xAI rejects format=true until a language code is sent. Detect first, then format.
    if language:
        form["format"] = "true"
        form["language"] = language
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
    language: Optional[str] = None,
    prompt: Optional[str] = None,
) -> tuple[str, Optional[str]]:
    openai_key, xai_key = resolve_stt_keys(uid)
    if not openai_key and not xai_key:
        raise SttError("service", "Transcription indisponible (service).")

    lang = _language_code(language)
    hint = _prompt_text(prompt)

    last_kind: Literal["service", "network"] = "network"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            attempts: list[tuple[str, object]] = []
            if xai_key:
                attempts.append(("xai", xai_key))
            if openai_key:
                attempts.append(("openai", openai_key))

            for index, (provider, api_key) in enumerate(attempts):
                is_last = index == len(attempts) - 1
                try:
                    response = (
                        await _post_openai(
                            client,
                            api_key=api_key,
                            data=data,
                            filename=filename,
                            mime=mime,
                            language=lang,
                            prompt=hint,
                        )
                        if provider == "openai"
                        else await _post_xai(
                            client,
                            api_key=api_key,
                            data=data,
                            filename=filename,
                            mime=mime,
                            language=lang,
                        )
                    )
                    if response.status_code == 400 and provider == "xai":
                        response = await _post_xai(
                            client,
                            api_key=api_key,
                            data=data,
                            filename=filename,
                            mime=mime,
                            language=lang,
                            include_model=False,
                        )
                except httpx.HTTPError as exc:
                    last_kind = "network"
                    if is_last:
                        raise SttError(
                            "network",
                            "Transcription indisponible (réseau).",
                        ) from exc
                    continue

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
                try:
                    try:
                        body: object = response.json()
                    except Exception:
                        body = response.text
                    text, detected = _text_and_language(body)
                except Exception:
                    last_kind = "network"
                    logger.warning("STT %s returned invalid JSON", provider, exc_info=True)
                    continue
                if text or is_last:
                    if (
                        text
                        and not lang
                        and not detected
                        and openai_key
                        and provider != "openai"
                    ):
                        try:
                            detect = await _post_openai(
                                client,
                                api_key=openai_key,
                                data=data,
                                filename=filename,
                                mime=mime,
                                language=None,
                                prompt=hint,
                            )
                            if detect.status_code < 400:
                                alt_text, alt_lang = _text_and_language(detect.json())
                                if alt_lang:
                                    return alt_text or text, alt_lang
                        except Exception:
                            logger.warning("STT language detection failed", exc_info=True)
                    return text, detected or lang
                logger.warning("STT %s returned empty text, trying next provider", provider)
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
