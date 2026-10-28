"""Edit an attached prompt image with OpenAI gpt-image-1."""
from __future__ import annotations

import os
from typing import Optional

import httpx

from app.core.config import settings
from app.core.firebase import load_user_api_keys

OPENAI_IMAGE_EDIT_URL = "https://api.openai.com/v1/images/edits"
_TIMEOUT = httpx.Timeout(120.0, connect=15.0)


class ImageEditError(Exception):
    pass


def _trim(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def resolve_openai_key(uid: Optional[str] = None) -> str:
    openai = ""
    if uid:
        try:
            openai = _trim(load_user_api_keys(uid).get("openai"))
        except Exception:
            openai = ""
    if not openai:
        openai = _trim(os.getenv("OPENAI_API_KEY")) or _trim(settings.openai_api_key)
    return openai


def _error_detail(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return error["message"].strip()
        if isinstance(payload.get("detail"), str):
            return payload["detail"].strip()
    text = response.text.strip()
    return text[:240] if text else f"HTTP {response.status_code}"


async def edit_image(
    data: bytes,
    *,
    filename: str,
    mime: str,
    prompt: str,
    uid: Optional[str] = None,
) -> tuple[str, str]:
    api_key = resolve_openai_key(uid)
    if not api_key:
        raise ImageEditError("Aucune clé OpenAI n'est configurée pour modifier l'image.")

    instruction = prompt.strip()
    if not instruction:
        raise ImageEditError("Décrivez la modification à appliquer à l'image.")

    files = {"image": (filename or "image.png", data, mime or "image/png")}
    form = {"model": "gpt-image-1", "prompt": instruction[:4000], "n": "1"}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            OPENAI_IMAGE_EDIT_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            data=form,
            files=files,
        )

    if response.status_code >= 400:
        raise ImageEditError(_error_detail(response) or "La modification de l'image a échoué.")

    payload = response.json()
    items = payload.get("data") if isinstance(payload, dict) else None
    first = items[0] if isinstance(items, list) and items else None
    encoded = first.get("b64_json") if isinstance(first, dict) else None
    if not isinstance(encoded, str) or not encoded.strip():
        raise ImageEditError("Le modèle n'a pas renvoyé d'image.")
    output_mime = "image/png"
    if isinstance(first, dict) and first.get("output_format") == "jpeg":
        output_mime = "image/jpeg"
    return output_mime, encoded.strip()
