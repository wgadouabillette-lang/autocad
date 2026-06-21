"""Routes API légères pour Vercel (sans dépendances CAO lourdes)."""
from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {
        "ok": True,
        "app": settings.app_name,
        "version": settings.version,
        "llm": settings.has_llm,
        "llm_provider": settings.llm_provider if settings.has_llm else "rules",
        "cad": False,
        "runtime": "vercel-lite",
    }
