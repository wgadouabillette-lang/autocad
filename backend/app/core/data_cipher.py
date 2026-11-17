"""AES-GCM for connector tokens and user API keys. Same layout as the Functions helper."""
from __future__ import annotations

import base64
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

PREFIX = "v1."
TOKEN_FIELDS = ("access_token", "refresh_token", "id_token")
_LOCAL_KEY_NAME = "meetra-data.key"


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _hosted() -> bool:
    return bool(
        os.getenv("VERCEL")
        or os.getenv("K_SERVICE")
        or os.getenv("FUNCTION_TARGET")
        or os.getenv("FORMA_SECRETS_REQUIRED", "").strip().lower() in {"1", "true", "yes", "on"}
    )


def _local_key_path() -> Path:
    from app.core.config import _data_dir

    return _data_dir() / ".data" / _LOCAL_KEY_NAME


def _key_from_env() -> Optional[bytes]:
    raw = os.getenv("MEETRA_DATA_KEY", "").strip()
    if not raw:
        return None
    try:
        key = _b64decode(raw)
    except Exception as exc:
        raise RuntimeError("MEETRA_DATA_KEY is not valid base64.") from exc
    if len(key) != 32:
        raise RuntimeError("MEETRA_DATA_KEY must decode to 32 bytes.")
    return key


def _local_key() -> Optional[bytes]:
    if _hosted():
        return None
    path = _local_key_path()
    try:
        if path.is_file():
            key = path.read_bytes()
            return key if len(key) == 32 else None
        path.parent.mkdir(parents=True, exist_ok=True)
        key = os.urandom(32)
        path.write_bytes(key)
        try:
            path.chmod(0o600)
        except OSError:
            pass
        return key
    except OSError as exc:
        logger.warning("Could not prepare the local data key: %s", exc)
        return None


def encryption_key() -> Optional[bytes]:
    env_key = _key_from_env()
    if env_key is not None:
        return env_key
    return _local_key()


def seal(plain: str) -> str:
    key = encryption_key()
    if key is None:
        raise RuntimeError("MEETRA_DATA_KEY is required to store secrets.")
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    nonce = os.urandom(12)
    encrypted = AESGCM(key).encrypt(nonce, plain.encode("utf-8"), None)
    return PREFIX + _b64encode(nonce + encrypted)


def open_sealed(stored: str) -> Optional[str]:
    if not stored.startswith(PREFIX):
        return stored
    key = encryption_key()
    if key is None:
        logger.error("Encrypted secret cannot be read without MEETRA_DATA_KEY.")
        return None
    try:
        raw = _b64decode(stored[len(PREFIX) :])
        if len(raw) < 12 + 16:
            return None
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        plain = AESGCM(key).decrypt(raw[:12], raw[12:], None)
        return plain.decode("utf-8")
    except Exception:
        logger.warning("Could not decrypt a stored secret.")
        return None


def seal_token_fields(entry: dict) -> dict:
    sealed = dict(entry)
    for field in TOKEN_FIELDS:
        value = sealed.get(field)
        if isinstance(value, str) and value and not value.startswith(PREFIX):
            sealed[field] = seal(value)
    return sealed


def open_token_fields(entry: dict) -> dict:
    opened = dict(entry)
    for field in TOKEN_FIELDS:
        value = opened.get(field)
        if isinstance(value, str) and value.startswith(PREFIX):
            opened[field] = open_sealed(value) or ""
    return opened


def token_fields_need_seal(entry: dict) -> bool:
    for field in TOKEN_FIELDS:
        value = entry.get(field)
        if isinstance(value, str) and value and not value.startswith(PREFIX):
            return True
    return False
