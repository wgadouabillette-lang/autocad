"""Entrée FastAPI minimale pour Vercel — diagnostic boot."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Meetra API")

_FALLBACK_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:47831",
    "http://127.0.0.1:47831",
    "http://localhost:47832",
    "http://127.0.0.1:47832",
    "https://meetra.cc",
    "https://www.meetra.cc",
    "https://autocad-blue.vercel.app",
]

try:
    from app.core.config import CORS_ORIGIN_REGEX, settings

    _cors_origins = settings.cors_origins
    app.title = settings.app_name
except Exception:
    CORS_ORIGIN_REGEX = (
        r"https://([a-z0-9-]+\.)*meetra\.cc"
        r"|https://([a-z0-9-]+\.)*vercel\.app"
        r"|http://(localhost|127\.0\.0\.1):\d+"
    )
    _cors_origins = _FALLBACK_CORS_ORIGINS

# Production desktop (Electron UI on 127.0.0.1:47832) calls this API with
# Authorization: Bearer <Firebase ID token>. Without CORS, preflight OPTIONS
# falls through to FastAPI and returns 405.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"ok": True, "runtime": "vercel-bare"}


try:
    from app.api.calendar_sync import router as calendar_sync_router
    from app.api.connector_resources import router as connector_resources_router
    from app.api.connectors import router as connectors_router
    from app.api.outlook_calendar_sync import router as outlook_calendar_sync_router
    from app.api.user_calendar_events import router as user_calendar_events_router

    app.include_router(connectors_router)
    app.include_router(connector_resources_router)
    app.include_router(calendar_sync_router)
    app.include_router(outlook_calendar_sync_router)
    app.include_router(user_calendar_events_router)
except Exception as exc:  # noqa: BLE001 — keep health alive if plugins fail to import
    @app.get("/api/boot-error")
    def boot_error():
        return {"ok": False, "error": str(exc)}


try:
    from app.api.account import router as account_router
    from app.api.billing import router as billing_router
    from app.api.desktop_auth import router as desktop_auth_router
    from app.api.handoffs import router as handoffs_router

    app.include_router(account_router)
    app.include_router(billing_router)
    app.include_router(desktop_auth_router)
    app.include_router(handoffs_router)
except Exception as exc:  # noqa: BLE001 — payments/auth must not take down connectors
    @app.get("/api/boot-extra-error")
    def boot_extra_error():
        return {"ok": False, "error": str(exc)}
