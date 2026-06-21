"""Chargement des variables depuis Google Secret Manager (bundle dotenv)."""
from __future__ import annotations

import io
import logging
import os
from functools import lru_cache
from typing import Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_BACKEND_SECRET = "forma-backend-env"
DEFAULT_FUNCTIONS_SECRET = "forma-functions-env"
DEFAULT_FRONTEND_SECRET = "forma-frontend-env"


def secrets_project_id() -> str:
    return (
        os.getenv("FORMA_SECRETS_PROJECT")
        or os.getenv("GOOGLE_CLOUD_PROJECT")
        or os.getenv("GCP_PROJECT")
        or os.getenv("FIREBASE_PROJECT_ID")
        or "forma-cad-dev"
    ).strip()


def use_local_env_only() -> bool:
    val = os.getenv("FORMA_USE_LOCAL_ENV", "").strip().lower()
    return val in {"1", "true", "yes", "on"}


def use_secret_manager() -> bool:
    """GSM at runtime needs GCP ADC — not available on Vercel serverless."""
    if use_local_env_only():
        return False
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV") or os.getenv("VERCEL_URL"):
        return False
    return True


def secrets_required() -> bool:
    val = os.getenv("FORMA_SECRETS_REQUIRED", "").strip().lower()
    return val in {"1", "true", "yes", "on"}


def backend_secret_id() -> str:
    return (os.getenv("FORMA_BACKEND_SECRET_ID") or DEFAULT_BACKEND_SECRET).strip()


@lru_cache(maxsize=8)
def _fetch_secret_payload(project_id: str, secret_id: str) -> Optional[str]:
    try:
        from google.cloud import secretmanager
    except ImportError as exc:
        logger.warning("google-cloud-secret-manager not installed: %s", exc)
        return None

    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
    except Exception as exc:
        logger.warning("Secret Manager access failed for %s: %s", secret_id, exc)
        return None

    data = response.payload.data
    if not data:
        return None
    return data.decode("utf-8")


def parse_dotenv_payload(payload: str) -> Dict[str, str]:
    from dotenv import dotenv_values

    values = dotenv_values(stream=io.StringIO(payload))
    return {key: value for key, value in values.items() if key and value is not None}


def apply_secret_values(values: Dict[str, str], *, override: bool = False) -> int:
    applied = 0
    for key, value in values.items():
        if not override and os.getenv(key):
            continue
        os.environ[key] = value
        applied += 1
    return applied


def load_secret_bundle(
    secret_id: str,
    *,
    project_id: Optional[str] = None,
    override: bool = False,
) -> int:
    project = (project_id or secrets_project_id()).strip()
    if not project or not secret_id:
        return 0

    payload = _fetch_secret_payload(project, secret_id)
    if not payload:
        return 0

    values = parse_dotenv_payload(payload)
    count = apply_secret_values(values, override=override)
    logger.info(
        "Loaded %s variables from Secret Manager secret %s (project %s)",
        count,
        secret_id,
        project,
    )
    return count


def load_backend_secrets(*, override: bool = False) -> int:
    if not use_secret_manager():
        return 0
    return load_secret_bundle(backend_secret_id(), override=override)


def load_backend_secrets_or_raise() -> int:
    count = load_backend_secrets()
    if count > 0:
        return count
    if secrets_required():
        raise RuntimeError(
            f"Secret Manager secret '{backend_secret_id()}' is required but unavailable. "
            "Run scripts/sync-env-to-secret-manager.py --push or set FORMA_USE_LOCAL_ENV=1."
        )
    return 0
