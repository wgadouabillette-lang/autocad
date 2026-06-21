"""Entrée FastAPI minimale pour Vercel (connecteurs + health, sans stack CAO)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.connector_resources import router as connector_resources_router
from app.api.connectors import router as connectors_router
from app.api.routes_lite import router as health_router
from app.core.config import settings

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

app.include_router(health_router)
app.include_router(connectors_router)
app.include_router(connector_resources_router)
