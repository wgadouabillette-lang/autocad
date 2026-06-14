"""Détection des limites API et repli automatique vers le mode Auto."""
from __future__ import annotations

from typing import Callable, Optional, Tuple

from app.ai import llm, models

_RATE_LIMIT_MARKERS = (
    "rate limit",
    "rate_limit",
    "429",
    "quota",
    "insufficient",
    "billing",
    "credit",
    "exceeded",
    "too many requests",
    "usage limit",
)

FALLBACK_NOTICE = (
    "_Limite du modèle atteinte — passage en mode **Auto**. "
    "Passez à l'abonnement Pro pour retrouver les modèles premium ; "
    "l'usage à la demande peut être ajouté en complément._"
)


def is_rate_limit_error(error: Optional[str], status_code: Optional[int] = None) -> bool:
    if status_code in (402, 429):
        return True
    if not error:
        return False
    low = error.lower()
    return any(marker in low for marker in _RATE_LIMIT_MARKERS)


def is_explicit_model(choice: Optional[str]) -> bool:
    key = (choice or "auto").strip().lower()
    return key not in ("", "auto")


def resolve_auto_model_id(
    prompt: str,
    *,
    has_images: bool = False,
    modelling: bool = False,
    work_mode: str = "agent",
    chat_only: bool = False,
) -> str:
    return models.resolve_model(
        "auto",
        prompt,
        has_images=has_images,
        modelling=modelling,
        work_mode=work_mode,
        chat_only=chat_only,
    )


def prepend_fallback_notice(message: str) -> str:
    text = (message or "").strip()
    if not text:
        return FALLBACK_NOTICE
    return f"{FALLBACK_NOTICE}\n\n{text}"


def maybe_retry_auto_model(
    ai_model: str,
    result: llm.LlmResult,
    retry_fn: Callable[[], llm.LlmResult],
) -> Tuple[llm.LlmResult, bool]:
    if result.data or not is_explicit_model(ai_model):
        return result, False
    if not (result.rate_limited or is_rate_limit_error(result.error)):
        return result, False
    retry = retry_fn()
    if retry.data:
        return retry, True
    return result, False
