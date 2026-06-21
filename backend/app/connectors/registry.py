"""Connector metadata and OAuth provider configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlencode

ProviderId = Literal["google", "microsoft", "spotify"]

CONNECTOR_IDS = ("calendar", "gmail", "outlook", "spotify")


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
            "openid",
            "email",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events",
        ),
    ),
    "gmail": ConnectorDef(
        id="gmail",
        label="Gmail",
        provider="google",
        scopes=(
            "openid",
            "email",
            "https://www.googleapis.com/auth/gmail.readonly",
        ),
    ),
    "outlook": ConnectorDef(
        id="outlook",
        label="Outlook",
        provider="microsoft",
        scopes=(
            "openid",
            "profile",
            "offline_access",
            "User.Read",
            "Mail.Read",
            "Calendars.ReadWrite",
        ),
    ),
    "spotify": ConnectorDef(
        id="spotify",
        label="Spotify",
        provider="spotify",
        scopes=(
            "streaming",
            "user-read-playback-state",
            "user-modify-playback-state",
            "user-read-currently-playing",
            "user-read-email",
            "user-read-private",
        ),
    ),
}


def oauth_redirect_base() -> str:
    return os.getenv("FORMA_OAUTH_REDIRECT_BASE", "http://127.0.0.1:8000").rstrip("/")


def frontend_origin() -> str:
    return os.getenv("FORMA_FRONTEND_ORIGIN", "http://127.0.0.1:5173").rstrip("/")


def frontend_base_path() -> str:
    raw = os.getenv("FORMA_FRONTEND_BASE_PATH", "/app").strip() or "/app"
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return raw.rstrip("/") or "/app"


def frontend_app_url(
    query: str = "",
    *,
    origin: str | None = None,
    base_path: str | None = None,
) -> str:
    """URL complète vers l'app SPA (ex. http://127.0.0.1:5173/app/?…)."""
    root = (origin or frontend_origin()).rstrip("/")
    base = (base_path or frontend_base_path()).rstrip("/")
    url = f"{root}{base}/"
    trimmed = query.lstrip("?")
    if trimmed:
        url += f"?{trimmed}"
    return url


def callback_url() -> str:
    return f"{oauth_redirect_base()}/api/connectors/oauth/callback"


def microsoft_oauth_tenant() -> str:
    return os.getenv("MICROSOFT_OAUTH_TENANT", "common").strip() or "common"


def provider_configured(provider: ProviderId) -> bool:
    if provider == "google":
        return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))
    if provider == "microsoft":
        return bool(
            os.getenv("MICROSOFT_OAUTH_CLIENT_ID") and os.getenv("MICROSOFT_OAUTH_CLIENT_SECRET")
        )
    if provider == "spotify":
        return bool(os.getenv("SPOTIFY_CLIENT_ID") and os.getenv("SPOTIFY_CLIENT_SECRET"))
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


def microsoft_authorize_url(state: str, scopes: tuple[str, ...]) -> str:
    tenant = microsoft_oauth_tenant()
    params = {
        "client_id": os.getenv("MICROSOFT_OAUTH_CLIENT_ID", ""),
        "redirect_uri": callback_url(),
        "response_type": "code",
        "scope": " ".join(scopes),
        "response_mode": "query",
        "prompt": "consent",
        "state": state,
    }
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(params)}"


def spotify_authorize_url(state: str, scopes: tuple[str, ...]) -> str:
    params = {
        "client_id": os.getenv("SPOTIFY_CLIENT_ID", ""),
        "response_type": "code",
        "redirect_uri": callback_url(),
        "scope": " ".join(scopes),
        "state": state,
    }
    return f"https://accounts.spotify.com/authorize?{urlencode(params)}"


def build_authorize_url(connector_id: str, state: str) -> str:
    spec = CONNECTORS[connector_id]
    if spec.provider == "google":
        return google_authorize_url(state, spec.scopes)
    if spec.provider == "microsoft":
        return microsoft_authorize_url(state, spec.scopes)
    if spec.provider == "spotify":
        return spotify_authorize_url(state, spec.scopes)
    raise ValueError(f"Unknown provider: {spec.provider}")
