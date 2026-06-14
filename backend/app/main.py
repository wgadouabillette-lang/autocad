"""Point d'entree FastAPI de Forma — AI-native CAD.

Lancer (Windows) :
    cd backend
    py -m venv .venv && .venv\\Scripts\\activate
    pip install -r requirements.txt
    uvicorn app.main:app --reload
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.billing import router as billing_router
from app.api.calendar_sync import router as calendar_sync_router
from app.api.connectors import router as connectors_router
from app.api.desktop_auth import router as desktop_auth_router
from app.api.routes import router
from app.core.config import ensure_desktop_env, settings

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
app.include_router(billing_router)
app.include_router(connectors_router)
app.include_router(calendar_sync_router)
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
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/")
    def spa_index():
        return FileResponse(static / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}
        candidate = static / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(static / "index.html")


if _IS_DESKTOP:
    ensure_desktop_env()
_mount_frontend()


@app.get("/api/app-meta")
def app_meta():
    return {
        "app": settings.app_name,
        "version": settings.version,
        "desktop": _IS_DESKTOP,
        "docs": "/docs",
        "health": "/api/health",
    }
