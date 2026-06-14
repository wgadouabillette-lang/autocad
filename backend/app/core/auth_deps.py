"""Dépendances FastAPI liées à Firebase Auth."""
from __future__ import annotations

from typing import Optional

from fastapi import Header, HTTPException

from app.core.firebase import FirebaseUser, load_user_api_keys, user_llm_key_override, verify_bearer_token


def optional_firebase_user(authorization: Optional[str] = Header(default=None)) -> Optional[FirebaseUser]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    return verify_bearer_token(token)


def require_firebase_user(
    authorization: Optional[str] = Header(default=None),
) -> FirebaseUser:
    user = optional_firebase_user(authorization)
    if user is None:
        raise HTTPException(401, "Authentication required.")
    return user


def run_with_user_llm_keys(user: Optional[FirebaseUser]):
    if user is None:
        return _NullContext()
    keys = load_user_api_keys(user.uid)
    if not keys:
        return _NullContext()
    return user_llm_key_override(keys)


class _NullContext:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return False
