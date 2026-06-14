"""Connector metadata and OAuth provider configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode

ProviderId = Literal["google", "notion", "figma"]

CONNECTOR_IDS = ("calendar", "gmail", "notion", "figma")


@dataclass(frozen=True)
class ConnectorDef:
    id: str
    label: str
    provider: ProviderId
    scopes: tuple[str, ...]


CONNECTORS: dict[str, ConnectorDef] = {
    "calendar": ConnectorDef(
        id="calendar",
        label="Google Calendar",
        provider="google",
        scopes=(
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events",
        ),
    ),
    "gmail": ConnectorDef(
        id="gmail",
        label="Gmail",
        provider="google",
        scopes=(
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/userinfo.email",
        ),
    ),
    "notion": ConnectorDef(
        id="notion",
        label="Notion",
        provider="notion",
        scopes=(),
    ),
    "figma": ConnectorDef(
        id="figma",
        label="Figma",
        provider="figma",
        scopes=("file_read",),
    ),
}


def oauth_redirect_base() -> str:
    return os.getenv("FORMA_OAUTH_REDIRECT_BASE", "http://127.0.0.1:8000").rstrip("/")


def frontend_origin() -> str:
    return os.getenv("FORMA_FRONTEND_ORIGIN", "http://127.0.0.1:5173").rstrip("/")


def callback_url() -> str:
    return f"{oauth_redirect_base()}/api/connectors/oauth/callback"


def provider_configured(provider: ProviderId) -> bool:
    if provider == "google":
        return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))
    if provider == "notion":
        return bool(os.getenv("NOTION_CLIENT_ID") and os.getenv("NOTION_CLIENT_SECRET"))
    if provider == "figma":
        return bool(os.getenv("FIGMA_CLIENT_ID") and os.getenv("FIGMA_CLIENT_SECRET"))
    return False


def connector_configured(connector_id: str) -> bool:
    spec = CONNECTORS.get(connector_id)
    if not spec:
        return False
    return provider_configured(spec.provider)


def google_authorize_url(state: str, scopes: tuple[str, ...]) -> str:
    params = {
        "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
        "redirect_uri": callback_url(),
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def notion_authorize_url(state: str) -> str:
    params = {
        "client_id": os.getenv("NOTION_CLIENT_ID", ""),
        "redirect_uri": callback_url(),
        "response_type": "code",
        "owner": "user",
        "state": state,
    }
    return f"https://api.notion.com/v1/oauth/authorize?{urlencode(params)}"


def figma_authorize_url(state: str, scopes: tuple[str, ...]) -> str:
    params = {
        "client_id": os.getenv("FIGMA_CLIENT_ID", ""),
        "redirect_uri": callback_url(),
        "scope": ",".join(scopes),
        "state": state,
        "response_type": "code",
    }
    return f"https://www.figma.com/oauth?{urlencode(params)}"


def build_authorize_url(connector_id: str, state: str) -> str:
    spec = CONNECTORS[connector_id]
    if spec.provider == "google":
        return google_authorize_url(state, spec.scopes)
    if spec.provider == "notion":
        return notion_authorize_url(state)
    if spec.provider == "figma":
        return figma_authorize_url(state, spec.scopes)
    raise ValueError(f"Unknown provider: {spec.provider}")
