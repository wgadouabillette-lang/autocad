"""Résolution du modèle IA choisi dans l'interface."""
from __future__ import annotations

import os
import re
from typing import List, Optional, Tuple

from app.core.config import settings

OPUS_47 = os.getenv("FORMA_OPUS_47_MODEL", "claude-opus-4-20250514")
OPUS_48 = os.getenv("FORMA_OPUS_48_MODEL", "claude-opus-4-20250514")

_COMPLEX_RE = re.compile(
    r"(analys|optimis|génér|convert|complex|ingénier|simul|calcul|contrainte|"
    r"trou|perçag|pattern|réseau|miroir|symétri|plusieurs|paramétr)",
    re.I,
)

# Auto chat : GPT-4o mini vs Grok 3 mini selon la tâche.
_CHAT_GPT_RE = re.compile(
    r"(```|`\w+|json|sql|regex|typescript|javascript|python|api|bug|fix|error|"
    r"liste|étape|step|how to|comment faire|calcul|formule|tableau|markdown|"
    r"refactor|debug|compile|syntax|function|class |import |const |def )",
    re.I,
)

_CHAT_GROK_RE = re.compile(
    r"(brainstorm|idée|créatif|humour|blague|histoire|story|avis|opinion|"
    r"discut|conversation|salut|coucou|pourquoi|explique-moi|resume|résume|"
    r"@\w+|/gmail|/calendar|/notion|/figma|/outlook|/play)",
    re.I,
)


def xai_mini_model() -> str:
    return os.getenv("XAI_MINI_MODEL", "grok-3-mini").strip() or "grok-3-mini"


def resolve_modelling_models(choice: Optional[str]) -> Tuple[str, str]:
    """Meilleurs modèles Grok pour @Modelling : vision puis raisonnement CAO."""
    key = (choice or "auto").strip().lower()
    vision = settings.xai_modelling_vision_model
    cad = settings.xai_modelling_cad_model
    if key in {"grok", "auto", "grok-4.3", "grok-vision", "xai", "grok-best"}:
        return vision, cad
    if key in {"grok-reasoning", "grok-4.20", "grok-4.20-reasoning"}:
        return vision, cad
    # Modèle explicite choisi par l'utilisateur → les deux phases
    explicit = choice or vision
    return explicit, explicit


def resolve_model(
    choice: Optional[str],
    prompt: str,
    *,
    has_images: bool = False,
    modelling: bool = False,
    work_mode: str = "agent",
    chat_only: bool = False,
) -> str:
    key = (choice or "auto").strip().lower()
    mode = (work_mode or "agent").strip().lower()

    if key == "auto" and chat_only:
        return _auto_chat_model(prompt)

    if modelling and settings.xai_api_key:
        vision, _cad = resolve_modelling_models(choice)
        return vision if has_images else _cad

    if mode == "render" and settings.xai_api_key:
        _vision, cad = resolve_modelling_models(choice)
        return cad

    if key in {"grok", "grok-4.3", "grok-best", "xai", "grok-vision"}:
        return settings.xai_vision_model if has_images else settings.xai_model
    if key in {"grok-mini", "grok-3-mini"}:
        return xai_mini_model()
    if key in {"gpt-4.1-nano", "gpt-4-1-nano"}:
        return settings.openai_auto_chat_model
    if key in {"gpt-4o-mini"}:
        return settings.openai_model
    if key in {"claude-opus-4-7", "opus-4.7", "opus_47", "opus47"}:
        return OPUS_47
    if key in {"claude-opus-4-8", "opus-4.8", "opus_48", "opus48"}:
        return OPUS_48

    if settings.xai_api_key and settings.llm_provider in ("xai", "auto"):
        if modelling:
            vision, cad = resolve_modelling_models(choice)
            return vision if has_images else cad
        return settings.xai_vision_model if has_images else settings.xai_model

    return _auto_model(prompt, has_images=has_images)


def decode_images(raw: Optional[List[dict]]) -> List[tuple[str, str]]:
    """[(mime, base64)] depuis le corps JSON agent."""
    out: List[tuple[str, str]] = []
    for item in raw or []:
        mime = (item.get("mime") or "image/png").strip()
        data = (item.get("data_b64") or "").strip()
        if data:
            out.append((mime, data))
    return out


def _auto_chat_model(prompt: str) -> str:
    """Auto chat : choisit GPT-4o mini ou Grok 3 mini selon la question (clé API du provider)."""
    openai_mini = settings.openai_model
    grok_mini = xai_mini_model()
    has_openai = bool(settings.openai_api_key)
    has_xai = bool(settings.xai_api_key)

    if has_openai and not has_xai:
        return openai_mini
    if has_xai and not has_openai:
        return grok_mini
    if not has_openai and not has_xai:
        if settings.anthropic_api_key:
            return OPUS_47
        return openai_mini

    text = (prompt or "").strip()
    score_gpt = 0
    score_grok = 0

    if _CHAT_GPT_RE.search(text):
        score_gpt += 2
    if len(text) > 220:
        score_gpt += 1
    if text.count("\n") >= 2:
        score_gpt += 1

    if _CHAT_GROK_RE.search(text):
        score_grok += 2
    low = text.lower()
    if low in {"hey", "hi", "hello", "yo", "salut", "bonjour", "coucou", "hola", "thanks", "merci"}:
        score_grok += 2
    if _COMPLEX_RE.search(text):
        score_grok += 1

    if score_gpt > score_grok:
        return openai_mini
    if score_grok > score_gpt:
        return grok_mini

    provider = (settings.llm_provider or "auto").strip().lower()
    if provider == "openai" and has_openai:
        return openai_mini
    if provider == "xai" and has_xai:
        return grok_mini
    return grok_mini if has_xai else openai_mini


def _auto_model(prompt: str, *, has_images: bool = False) -> str:
    if settings.xai_api_key:
        return settings.xai_vision_model if has_images else settings.xai_model
    if has_images:
        return settings.openai_model
    score = 0
    if len(prompt) > 120:
        score += 1
    if len(prompt) > 220:
        score += 2
    if _COMPLEX_RE.search(prompt):
        score += 2
    if prompt.count("\n") >= 2:
        score += 1
    return OPUS_48 if score >= 2 else OPUS_47
