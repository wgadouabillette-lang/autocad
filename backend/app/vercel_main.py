"""Entrée FastAPI minimale pour Vercel — diagnostic boot."""
from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="Lyte API")


@app.get("/api/health")
def health():
    return {"ok": True, "runtime": "vercel-bare"}


try:
    from app.api.calendar_sync import router as calendar_sync_router
    from app.api.connector_resources import router as connector_resources_router
    from app.api.connectors import router as connectors_router
    from app.api.outlook_calendar_sync import router as outlook_calendar_sync_router
    from app.api.user_calendar_events import router as user_calendar_events_router
    from app.core.config import settings

    app.title = settings.app_name
    app.include_router(connectors_router)
    app.include_router(connector_resources_router)
    app.include_router(calendar_sync_router)
    app.include_router(outlook_calendar_sync_router)
    app.include_router(user_calendar_events_router)
except Exception as exc:  # noqa: BLE001 — keep health alive if plugins fail to import
    @app.get("/api/boot-error")
    def boot_error():
        return {"ok": False, "error": str(exc)}
