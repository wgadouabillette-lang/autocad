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


_DEFAULT_LOCAL_OAUTH_BASE = "http://127.0.0.1:8000"
_PRODUCTION_OAUTH_BASE = "https://autocad-blue.vercel.app"


def oauth_redirect_base() -> str:
    return os.getenv("FORMA_OAUTH_REDIRECT_BASE", _DEFAULT_LOCAL_OAUTH_BASE).rstrip("/")


def _is_local_oauth_base(base: str) -> bool:
    lowered = base.strip().rstrip("/").lower()
    if lowered in {_DEFAULT_LOCAL_OAUTH_BASE, "http://localhost:8000"}:
        return True
    return lowered.startswith("http://127.0.0.1:") or lowered.startswith("http://localhost:")


def resolve_oauth_redirect_base(
    return_origin: str | None = None,
    request_origin: str | None = None,
) -> str:
    """Pick the OAuth callback host (API origin).

    Local dev uses port 8000. On Vercel, frontend and API share the same HTTPS
    origin — never use localhost if the browser or request is on production.
    """
    env_base = oauth_redirect_base()
    if not _is_local_oauth_base(env_base):
        return env_base

    for hint in (return_origin, request_origin):
        if not hint:
            continue
        origin = hint.strip().rstrip("/")
        if origin.startswith("https://"):
            return origin

    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV") or os.getenv("VERCEL_URL"):
        return _PRODUCTION_OAUTH_BASE

    return env_base


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


def callback_url(redirect_base: str | None = None) -> str:
    base = (redirect_base or oauth_redirect_base()).rstrip("/")
    return f"{base}/api/connectors/oauth/callback"


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


def google_authorize_url(
    state: str,
    scopes: tuple[str, ...],
    *,
    redirect_base: str | None = None,
) -> str:
    params = {
        "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
        "redirect_uri": callback_url(redirect_base),
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


def microsoft_authorize_url(
    state: str,
    scopes: tuple[str, ...],
    *,
    redirect_base: str | None = None,
) -> str:
    tenant = microsoft_oauth_tenant()
    params = {
        "client_id": os.getenv("MICROSOFT_OAUTH_CLIENT_ID", ""),
        "redirect_uri": callback_url(redirect_base),
        "response_type": "code",
        "scope": " ".join(scopes),
        "response_mode": "query",
        "prompt": "consent",
        "state": state,
    }
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(params)}"


def spotify_authorize_url(
    state: str,
    scopes: tuple[str, ...],
    *,
    redirect_base: str | None = None,
) -> str:
    params = {
        "client_id": os.getenv("SPOTIFY_CLIENT_ID", ""),
        "response_type": "code",
        "redirect_uri": callback_url(redirect_base),
        "scope": " ".join(scopes),
        "state": state,
    }
    return f"https://accounts.spotify.com/authorize?{urlencode(params)}"


def build_authorize_url(
    connector_id: str,
    state: str,
    *,
    redirect_base: str | None = None,
) -> str:
    spec = CONNECTORS[connector_id]
    if spec.provider == "google":
        return google_authorize_url(state, spec.scopes, redirect_base=redirect_base)
    if spec.provider == "microsoft":
        return microsoft_authorize_url(state, spec.scopes, redirect_base=redirect_base)
    if spec.provider == "spotify":
        return spotify_authorize_url(state, spec.scopes, redirect_base=redirect_base)
    raise ValueError(f"Unknown provider: {spec.provider}")
