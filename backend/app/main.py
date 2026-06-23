"""Point d'entree FastAPI de Forma — AI-native CAD.

Lancer (Windows) :
    cd backend
    py -m venv .venv && .venv\\Scripts\\activate
    pip install -r requirements.txt
    pip install -r requirements-cad.txt
    uvicorn app.main:app --reload
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.billing import router as billing_router
from app.api.handoffs import router as handoffs_router
from app.api.calendar_sync import router as calendar_sync_router
from app.api.outlook_calendar_sync import router as outlook_calendar_sync_router
from app.api.connector_resources import router as connector_resources_router
from app.api.connectors import router as connectors_router
from app.api.desktop_auth import router as desktop_auth_router
from app.api.user_calendar_events import router as user_calendar_events_router
from app.core.config import ensure_desktop_env, settings


def _running_on_vercel() -> bool:
    return bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV") or os.getenv("VERCEL_URL"))


def _cad_deps_available() -> bool:
    try:
        import numpy  # noqa: F401
    except ImportError:
        return False
    return True


def _load_api_router():
    if _running_on_vercel() or not _cad_deps_available():
        from app.api.routes_lite import router as lite_router

        return lite_router
    from app.api.routes import router as full_router

    return full_router


router = _load_api_router()

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    swagger_ui_parameters={"syntaxHighlight.theme": "agate"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(handoffs_router)
app.include_router(billing_router)
app.include_router(connector_resources_router)
app.include_router(connectors_router)
app.include_router(calendar_sync_router)
app.include_router(outlook_calendar_sync_router)
app.include_router(user_calendar_events_router)
app.include_router(desktop_auth_router)

_STATIC_DIR = os.getenv("FORMA_STATIC")
_IS_DESKTOP = os.getenv("FORMA_DESKTOP", "").strip().lower() in {"1", "true", "yes", "on"}


def _mount_frontend() -> None:
    if not _STATIC_DIR:
        return
    static = Path(_STATIC_DIR)
    if not static.is_dir():
        return
    assets = static / "assets"
    icons = static / "icons"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")
        app.mount("/app/assets", StaticFiles(directory=assets), name="app-assets")
    if icons.is_dir():
        app.mount("/icons", StaticFiles(directory=icons), name="icons")
        app.mount("/app/icons", StaticFiles(directory=icons), name="app-icons")

    @app.get("/")
    def spa_index():
        return RedirectResponse(url="/app/", status_code=302)

    @app.get("/app")
    def spa_app_redirect():
        return RedirectResponse(url="/app/", status_code=302)

    @app.get("/app/")
    def spa_app_index():
        return FileResponse(static / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = static / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        if full_path == "app" or full_path.startswith("app/"):
            return FileResponse(static / "index.html")
        return FileResponse(static / "index.html")


if _IS_DESKTOP:
    ensure_desktop_env()
_mount_frontend()


@app.on_event("startup")
def _warmup_services() -> None:
    """Évite le cold-start (Firebase + Stripe) au premier clic checkout."""
    import logging

    logger = logging.getLogger(__name__)
    try:
        from app.core.firebase import _ensure_app, _ensure_db
        from app.billing.stripe_service import _stripe

        _ensure_app()
        _ensure_db()
        if settings.stripe_secret_key.strip():
            _stripe()
    except Exception as exc:
        logger.warning("Startup warmup skipped: %s", exc)


@app.get("/api/app-meta")
def app_meta():
    return {
        "app": settings.app_name,
        "version": settings.version,
        "desktop": _IS_DESKTOP,
        "vercel": _running_on_vercel(),
        "cad": _cad_deps_available(),
        "docs": "/docs",
        "health": "/api/health",
    }
