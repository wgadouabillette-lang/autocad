"""Client LLM optionnel (xAI Grok / OpenAI / Anthropic)."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx

from app.ai.modelling import MODELLING_SYSTEM_PROMPT
from app.core.config import settings

logger = logging.getLogger(__name__)

# Image = (mime_type, base64 sans préfixe data:)
AgentImage = Tuple[str, str]

SYSTEM_PROMPT = """You are a CAD assistant. You transform a natural-language instruction
into operations on a parametric document (units mm).

Respond ONLY with valid JSON:
{
  "message": "brief explanation in English",
  "operations": [
    {"op": "add",    "feature": {"id":"...","type":"...","name":"...","params":{...}}},
    {"op": "modify", "feature_id":"...", "params": {...}},
    {"op": "remove", "feature_id":"..."}
  ]
}

STEP 1 — INTERPRET THE REQUEST (required, silently)
====================================================
Identify the desired shape BEFORE choosing the feature type:
- ball / sphere / sphère / boule → type "sphere" with params {r: radius_mm}
- cube / box / parallelepiped → type "box" with {w, d, h}
- cylinder / tube / round / thick disc → type "cylinder" with {r, h}
- plate / flat / panel → extrude rectangle (NOT sphere or solid box)
- hole / drill / screw → hole or pattern_*
- fillet / chamfer / shell → fillet / chamfer / shell

CRITICAL RULE: NEVER confuse a sphere with a plate or cube.
If the user says "ball" or "sphere", you MUST use type "sphere".

EMPTY DOCUMENT
==============
If the context shows 0 features, create geometry matching EXACTLY the request
(one primitive or suitable extrude). Do not default to a plate.

FEATURE TYPES
=============
box{w,d,h}, cylinder{r,h}, sphere{r},
extrude{profile,distance,operation,z0?} with profile.shape = rectangle|circle|points,
hole{x,y,diameter,through,z_top}, pattern_linear{count,dx,dy,dz,feature},
pattern_circular{count,angle,cx,cy,feature}, fillet{radius}, chamfer{distance}, shell{thickness}.
Do not invent other types.

EXAMPLES
========
Request: "a ball of radius 25"
{"message":"Sphere R25 mm","operations":[{"op":"add","feature":{"id":"sph-1","type":"sphere","name":"Sphere","params":{"r":25}}}]}

Request: "40 mm cube"
{"message":"Cube 40 mm","operations":[{"op":"add","feature":{"id":"box-1","type":"box","name":"Cube","params":{"w":40,"d":40,"h":40}}}]}

Request: "cylinder diameter 30 height 50"
{"message":"Cylinder Ø30×50","operations":[{"op":"add","feature":{"id":"cyl-1","type":"cylinder","name":"Cylinder","params":{"r":15,"h":50}}}]}

Request: "plate 100×60 thickness 8"
{"message":"Plate 100×60×8","operations":[{"op":"add","feature":{"id":"ext-1","type":"extrude","name":"Plate","params":{"profile":{"shape":"rectangle","w":100,"d":60},"distance":8,"operation":"add"}}}]}"""

FACE_CONSTRAINT_APPEND = """
SELECTED FACES CONSTRAINT (overrides any other interpretation):
- The user prompt contains [FACE CONSTRAINT] and [REFERENCE FACE] with normal and reference point (mm).
- You must return ONLY "add" operations of type hole, pattern_linear, or pattern_circular.
- Place each hole at the x,y coordinates of the reference point (centroid) of the relevant face.
- z_top should be near the top of the part or the centroid if the face is horizontal (+Z).
- Forbidden: modify, remove, set_material, fillet, chamfer, shell, box, cylinder, sphere, extrude.
- If the request cannot be done locally on these faces, explain in "message" and return "operations": [].
"""


@dataclass
class LlmResult:
    data: Optional[dict]
    error: Optional[str] = None
    rate_limited: bool = False


def available() -> bool:
    return settings.has_llm


def active_provider() -> Optional[str]:
    return _pick_provider()


def complete_json(
    user_prompt: str,
    context: str,
    model_id: Optional[str] = None,
    images: Optional[List[AgentImage]] = None,
    system_override: Optional[str] = None,
    modelling: bool = False,
) -> LlmResult:
    """Appelle le LLM. En cas d'échec, `error` contient un message lisible."""
    system = system_override or (MODELLING_SYSTEM_PROMPT if modelling else SYSTEM_PROMPT)
    if system_override is not None and not images:
        user_text = user_prompt
    else:
        user_text = _user_text(user_prompt, context, modelling=modelling)
    return invoke(system, user_text, model_id=model_id, images=images)


def complete_text(
    user_prompt: str,
    history: Optional[List[dict]] = None,
    model_id: Optional[str] = None,
    system: str = "You are a helpful assistant. Reply in plain text.",
) -> LlmResult:
    """Chat conversationnel — réponse texte libre (pas de JSON)."""
    provider = _provider_for_model(model_id) or _pick_provider()
    if provider is None:
        return LlmResult(None, "No LLM API key configured (backend/.env).")

    messages: List[dict] = []
    for item in history or []:
        role = (item.get("role") or "").strip()
        content = (item.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_prompt.strip()})

    try:
        if provider == "xai":
            raw = _openai_compat_messages_raw_text(
                settings.xai_api_base,
                settings.xai_api_key,
                messages,
                model_id or settings.xai_model,
                system,
            )
        elif provider == "openai":
            raw = _openai_compat_messages_raw_text(
                settings.openai_api_base,
                settings.openai_api_key,
                messages,
                model_id or settings.openai_model,
                system,
            )
        elif provider == "anthropic":
            raw = _anthropic_messages_raw_text(messages, model_id, system)
        else:
            return LlmResult(None, f"Unknown provider: {provider}")
    except httpx.HTTPStatusError as exc:
        detail = _http_error_detail(exc)
        logger.warning("LLM chat %s HTTP %s: %s", provider, exc.response.status_code, detail)
        return LlmResult(
            None,
            detail,
            rate_limited=exc.response.status_code in (402, 429) or _looks_rate_limited(detail),
        )
    except httpx.TimeoutException:
        return LlmResult(None, "Timeout while waiting for a reply. Please try again.")
    except Exception as exc:
        if settings.llm_debug:
            logger.exception("LLM chat %s failed", provider)
        return LlmResult(None, f"LLM error ({provider}): {exc}")

    text = (raw or "").strip()
    if not text:
        return LlmResult(None, "Empty AI response.")
    return LlmResult({"message": text}, None)


def invoke(
    system: str,
    user_text: str,
    model_id: Optional[str] = None,
    images: Optional[List[AgentImage]] = None,
    max_tokens: int = 8192,
    temperature: float = 0.05,
) -> LlmResult:
    """Appel LLM brut → JSON parsé."""
    provider = _pick_provider()
    if provider is None:
        return LlmResult(None, "No LLM API key configured (backend/.env).")

    try:
        if provider == "xai":
            raw = _xai_raw_text(
                user_text, model_id, images, system, max_tokens=max_tokens, temperature=temperature
            )
        elif provider == "openai":
            raw = _openai_compat_raw_text(
                settings.openai_api_base,
                settings.openai_api_key,
                user_text,
                model_id or settings.openai_model,
                images,
                system,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        elif provider == "anthropic":
            raw = _anthropic_raw_text(
                user_text, model_id, images, system, max_tokens=max_tokens
            )
        else:
            return LlmResult(None, f"Unknown provider: {provider}")
    except httpx.HTTPStatusError as exc:
        detail = _http_error_detail(exc)
        logger.warning("LLM %s HTTP %s: %s", provider, exc.response.status_code, detail)
        return LlmResult(
            None,
            detail,
            rate_limited=exc.response.status_code in (402, 429) or _looks_rate_limited(detail),
        )
    except httpx.TimeoutException:
        return LlmResult(
            None,
            "Timeout: image analysis can take up to 2 minutes. Please try again.",
        )
    except Exception as exc:
        if settings.llm_debug:
            logger.exception("LLM %s failed", provider)
        return LlmResult(None, f"LLM error ({provider}): {exc}")

    if not raw:
        return LlmResult(None, "Empty AI response.")

    parsed = _extract_json(raw)
    if parsed is None:
        snippet = raw[:280].replace("\n", " ")
        return LlmResult(
            None,
            f"Unreadable AI response (JSON expected). Excerpt: {snippet}…",
        )
    return LlmResult(parsed, None)


def _looks_rate_limited(detail: str) -> bool:
    from app.ai.quota import is_rate_limit_error

    return is_rate_limit_error(detail)


def _http_error_detail(exc: httpx.HTTPStatusError) -> str:
    try:
        body = exc.response.json()
        err = body.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err)
        if isinstance(err, str):
            return err
        return json.dumps(body)[:400]
    except Exception:
        return (exc.response.text or str(exc))[:400]


def _pick_provider() -> Optional[str]:
    p = (settings.llm_provider or "auto").strip().lower()
    if p == "xai" and settings.xai_api_key:
        return "xai"
    if p == "openai" and settings.openai_api_key:
        return "openai"
    if p == "anthropic" and settings.anthropic_api_key:
        return "anthropic"
    if settings.xai_api_key:
        return "xai"
    if settings.openai_api_key:
        return "openai"
    if settings.anthropic_api_key:
        return "anthropic"
    return None


def _provider_for_model(model_id: Optional[str]) -> Optional[str]:
    """Route vers le bon fournisseur selon l'id de modèle résolu."""
    mid = (model_id or "").strip().lower()
    if not mid:
        return None
    if mid.startswith("gpt-") or mid.startswith(("o1", "o3", "o4")):
        return "openai" if settings.openai_api_key else None
    if mid.startswith("claude-"):
        return "anthropic" if settings.anthropic_api_key else None
    if "grok" in mid:
        return "xai" if settings.xai_api_key else None
    return None


def _message_text(payload: dict) -> str:
    msg = payload["choices"][0]["message"]
    content = (msg.get("content") or "").strip()
    if content:
        return content
    return (msg.get("reasoning_content") or "").strip()


def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start : end + 1])
    except Exception:
        return None


def _user_text(user_prompt: str, context: str, *, modelling: bool = False) -> str:
    if modelling:
        from app.ai.modelling import modelling_user_instruction

        return modelling_user_instruction(user_prompt, context)
    return f"Document context:\n{context}\n\nInstruction: {user_prompt}"


def _vision_user_content(
    user_prompt: str,
    context: str,
    images: Optional[List[AgentImage]],
) -> list | str:
    text = _user_text(user_prompt, context)
    if not images:
        return text
    blocks: list = [{"type": "text", "text": text}]
    for mime, b64 in images:
        blocks.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"},
            }
        )
    return blocks


def _chat_payload(
    model: str,
    user_prompt: str,
    context: str,
    images: Optional[List[AgentImage]],
    system: str,
) -> dict:
    return {
        "model": model,
        "temperature": 0.1,
        "max_tokens": 8192 if images else 4096,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": _vision_user_content(user_prompt, context, images)},
        ],
    }


def _xai_raw_text(
    user_text: str,
    model_id: Optional[str],
    images: Optional[List[AgentImage]],
    system: str,
    max_tokens: int = 8192,
    temperature: float = 0.05,
) -> str:
    model = model_id or (settings.xai_vision_model if images else settings.xai_model)
    return _openai_compat_raw_text(
        settings.xai_api_base,
        settings.xai_api_key,
        user_text,
        model,
        images,
        system,
        max_tokens=max_tokens,
        temperature=temperature,
    )


def _openai_compat_raw_text(
    base_url: str,
    api_key: str,
    user_text: str,
    model: str,
    images: Optional[List[AgentImage]],
    system: str,
    max_tokens: int = 8192,
    temperature: float = 0.05,
) -> str:
    url = base_url.rstrip("/") + "/chat/completions"
    timeout = 240 if images else 120
    content: list | str = user_text
    if images:
        blocks: list = [{"type": "text", "text": user_text}]
        for mime, b64 in images:
            blocks.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"},
                }
            )
        content = blocks
    r = httpx.post(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return _message_text(r.json())


def _openai_compat_messages_raw_text(
    base_url: str,
    api_key: str,
    messages: List[dict],
    model: str,
    system: str,
    max_tokens: int = 2048,
    temperature: float = 0.4,
) -> str:
    url = base_url.rstrip("/") + "/chat/completions"
    payload_messages = [{"role": "system", "content": system}, *messages]
    r = httpx.post(
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": payload_messages,
        },
        timeout=120,
    )
    r.raise_for_status()
    return _message_text(r.json())


def _anthropic_messages_raw_text(
    messages: List[dict],
    model_id: Optional[str],
    system: str,
    max_tokens: int = 2048,
) -> str:
    blocks: list = []
    for item in messages:
        role = item.get("role")
        content = item.get("content") or ""
        if role == "assistant":
            blocks.append({"role": "assistant", "content": [{"type": "text", "text": content}]})
        elif role == "user":
            blocks.append({"role": "user", "content": [{"type": "text", "text": content}]})
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": model_id or settings.anthropic_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": blocks,
        },
        timeout=120,
    )
    r.raise_for_status()
    return _extract_json_text_anthropic(r.json())


def _anthropic_raw_text(
    user_text: str,
    model_id: Optional[str],
    images: Optional[List[AgentImage]],
    system: str,
    max_tokens: int = 8192,
) -> str:
    blocks: list = [{"type": "text", "text": user_text}]
    for mime, b64 in images or []:
        if mime == "image/jpg":
            mime = "image/jpeg"
        blocks.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": mime, "data": b64},
            }
        )
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.anthropic_api_key,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": model_id or settings.anthropic_model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": blocks}],
        },
        timeout=240 if images else 120,
    )
    r.raise_for_status()
    return _extract_json_text_anthropic(r.json())


def _xai_raw(
    user_prompt: str,
    context: str,
    model_id: Optional[str],
    images: Optional[List[AgentImage]],
    system: str,
) -> str:
    return _xai_raw_text(_user_text(user_prompt, context), model_id, images, system)


def _openai_compat_raw(
    base_url: str,
    api_key: str,
    user_prompt: str,
    context: str,
    model: str,
    images: Optional[List[AgentImage]],
    system: str,
) -> str:
    return _openai_compat_raw_text(
        base_url, api_key, _user_text(user_prompt, context), model, images, system
    )


def _anthropic_raw(
    user_prompt: str,
    context: str,
    model_id: Optional[str],
    images: Optional[List[AgentImage]],
    system: str,
) -> str:
    return _anthropic_raw_text(_user_text(user_prompt, context), model_id, images, system)


def _extract_json_text_anthropic(payload: dict) -> str:
    parts = []
    for block in payload.get("content", []):
        if block.get("type") == "text":
            parts.append(block.get("text", ""))
    return "\n".join(parts).strip()
