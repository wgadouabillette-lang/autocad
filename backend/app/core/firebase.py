"""Firebase Admin — vérification des tokens et lecture des clés utilisateur."""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_app = None
_db = None


def _project_id() -> str:
    return (os.getenv("FIREBASE_PROJECT_ID") or "forma-cad-dev").strip()


def _credential_path() -> str:
    explicit = (os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "").strip()
    if explicit and os.path.isfile(explicit):
        return explicit
    from app.core.config import _data_dir

    bundled = Path(__file__).resolve().parents[2] / "firebase-adminsdk.json"
    if bundled.is_file():
        return str(bundled)
    user_file = _data_dir() / "firebase-adminsdk.json"
    if user_file.is_file():
        return str(user_file)
    return ""


def _ensure_app():
    global _app, _db
    if _app is not None:
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        logger.warning("firebase-admin not installed; Firebase auth disabled.")
        return

    if not firebase_admin._apps:
        cred_path = _credential_path()
        if cred_path:
            cred = credentials.Certificate(cred_path)
            _app = firebase_admin.initialize_app(cred, {"projectId": _project_id()})
        else:
            try:
                cred = credentials.ApplicationDefault()
                _app = firebase_admin.initialize_app(cred, {"projectId": _project_id()})
            except Exception:
                _app = firebase_admin.initialize_app(options={"projectId": _project_id()})
    else:
        _app = firebase_admin.get_app()
    _db = firestore.client()


@dataclass
class FirebaseUser:
    uid: str
    email: Optional[str]


@dataclass
class FirebaseDirectoryUser:
    uid: str
    email: str
    display_name: str
    photo_url: Optional[str]


def verify_bearer_token(token: str) -> Optional[FirebaseUser]:
    token = (token or "").strip()
    if not token:
        return None
    _ensure_app()
    if _app is None:
        return None
    try:
        from firebase_admin import auth

        decoded = auth.verify_id_token(token)
        return FirebaseUser(uid=str(decoded["uid"]), email=decoded.get("email"))
    except Exception as exc:
        logger.debug("Firebase token verification failed: %s", exc)
        return None


def find_user_by_email(email: str) -> Optional[FirebaseDirectoryUser]:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    _ensure_app()
    if _app is None:
        return None
    try:
        from firebase_admin import auth

        user = auth.get_user_by_email(normalized)
        display_name = (user.display_name or "").strip() or normalized.split("@")[0]
        return FirebaseDirectoryUser(
            uid=str(user.uid),
            email=normalized,
            display_name=display_name,
            photo_url=user.photo_url,
        )
    except Exception as exc:
        logger.debug("Firebase email lookup failed for %s: %s", normalized, exc)
        return None


def upsert_user_directory(user: FirebaseDirectoryUser) -> None:
    _ensure_app()
    if _db is None:
        return
    try:
        from firebase_admin import firestore

        data = {
            "uid": user.uid,
            "email": user.email,
            "displayName": user.display_name,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if user.photo_url:
            data["photoURL"] = user.photo_url
        _db.collection("userDirectory").document(user.uid).set(data, merge=True)
    except Exception as exc:
        logger.warning("Failed to upsert user directory for %s: %s", user.uid, exc)


def load_user_api_keys(uid: str) -> Dict[str, str]:
    _ensure_app()
    if _db is None:
        return {}
    keys: Dict[str, str] = {}
    try:
        docs = _db.collection(f"users/{uid}/private/apiKeys").stream()
        for doc in docs:
            data = doc.to_dict() or {}
            value = data.get("apiKey")
            if isinstance(value, str) and value.strip():
                keys[doc.id] = value.strip()
    except Exception as exc:
        logger.warning("Failed to load user API keys for %s: %s", uid, exc)
    return keys


def _billing_ref(uid: str):
    _ensure_app()
    if _db is None:
        return None
    return _db.collection("users").document(uid).collection("private").document("billing")


def load_user_billing(uid: str) -> Dict[str, object]:
    ref = _billing_ref(uid)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if not snap.exists:
            return {}
        return snap.to_dict() or {}
    except Exception as exc:
        logger.warning("Failed to load billing for %s: %s", uid, exc)
        return {}


def save_user_billing(uid: str, data: Dict[str, object]) -> None:
    ref = _billing_ref(uid)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        ref.set({**data, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    except Exception as exc:
        logger.warning("Failed to save billing for %s: %s", uid, exc)


def update_user_subscription_profile(
    uid: str,
    *,
    subscription_plan: str,
    on_demand_usage_enabled: bool,
    billing_managed: bool = True,
) -> None:
    _ensure_app()
    if _db is None:
        return
    try:
        from firebase_admin import firestore

        _db.collection("users").document(uid).set(
            {
                "subscriptionPlan": subscription_plan,
                "onDemandUsageEnabled": on_demand_usage_enabled,
                "billingManaged": billing_managed,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
    except Exception as exc:
        logger.warning("Failed to update subscription profile for %s: %s", uid, exc)


def find_uid_by_stripe_customer(customer_id: str) -> Optional[str]:
    _ensure_app()
    if _db is None or not customer_id:
        return None
    try:
        query = (
            _db.collection_group("private")
            .where("stripeCustomerId", "==", customer_id)
            .limit(1)
            .stream()
        )
        for doc in query:
            user_ref = doc.reference.parent.parent
            if user_ref is not None:
                return str(user_ref.id)
    except Exception as exc:
        logger.warning("Stripe customer lookup failed for %s: %s", customer_id, exc)
    return None


@contextmanager
def user_llm_key_override(keys: Dict[str, str]) -> Iterator[None]:
    """Applique temporairement les clés LLM utilisateur sur settings."""
    original = (
        settings.xai_api_key,
        settings.openai_api_key,
        settings.anthropic_api_key,
    )
    if keys.get("xai"):
        settings.xai_api_key = keys["xai"]
    if keys.get("openai"):
        settings.openai_api_key = keys["openai"]
    if keys.get("anthropic"):
        settings.anthropic_api_key = keys["anthropic"]
    try:
        yield
    finally:
        settings.xai_api_key, settings.openai_api_key, settings.anthropic_api_key = original
