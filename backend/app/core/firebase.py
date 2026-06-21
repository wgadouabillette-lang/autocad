"""Firebase Admin — vérification des tokens et lecture des clés utilisateur."""
from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

_app = None
_db = None
_db_unavailable = False
_token_cache: Dict[str, Tuple["FirebaseUser", float]] = {}
_TOKEN_CACHE_TTL_SECONDS = 300
_billing_cache: Dict[str, Tuple[float, Dict[str, object]]] = {}
_BILLING_CACHE_TTL_SECONDS = 120


def _project_id() -> str:
    return (os.getenv("FIREBASE_PROJECT_ID") or "forma-cad-dev").strip()


def _service_account_dict() -> dict | None:
    raw = (os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not raw:
        return None
    import json

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.")
        return None
    return parsed if isinstance(parsed, dict) else None


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
    global _app
    if _app is not None:
        return
    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError:
        logger.warning("firebase-admin not installed; Firebase auth disabled.")
        return

    if not firebase_admin._apps:
        sa_dict = _service_account_dict()
        cred_path = _credential_path()
        try:
            if sa_dict:
                cred = credentials.Certificate(sa_dict)
                _app = firebase_admin.initialize_app(cred, {"projectId": _project_id()})
            elif cred_path:
                cred = credentials.Certificate(cred_path)
                _app = firebase_admin.initialize_app(cred, {"projectId": _project_id()})
            else:
                try:
                    cred = credentials.ApplicationDefault()
                    _app = firebase_admin.initialize_app(cred, {"projectId": _project_id()})
                except Exception:
                    _app = firebase_admin.initialize_app(options={"projectId": _project_id()})
        except Exception as exc:
            logger.warning("Firebase Admin init failed; auth/storage disabled: %s", exc)
            return
    else:
        _app = firebase_admin.get_app()


def _ensure_db():
    global _db, _db_unavailable
    _ensure_app()
    if _db is not None or _db_unavailable or _app is None:
        return
    try:
        from firebase_admin import firestore

        _db = firestore.client()
    except Exception as exc:
        _db_unavailable = True
        logger.warning("Firestore client unavailable: %s", exc)


def firestore_available() -> bool:
    _ensure_db()
    return _db is not None


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

    now = time.monotonic()
    cached = _token_cache.get(token)
    if cached and cached[1] > now:
        from app.billing.checkout_timing import timing_enabled

        if timing_enabled():
            logger.info(
                "checkout timing token_verify=0ms uid=%s cached=1",
                cached[0].uid,
            )
        return cached[0]

    verify_start = time.monotonic()
    project_id = _project_id()
    user: Optional[FirebaseUser] = None

    _ensure_app()
    if _app is not None:
        try:
            from firebase_admin import auth

            decoded = auth.verify_id_token(token, check_revoked=False)
            user = FirebaseUser(uid=str(decoded["uid"]), email=decoded.get("email"))
        except Exception as exc:
            logger.debug("Firebase Admin token verification failed: %s", exc)

    if user is None:
        try:
            from google.auth.transport import requests as google_requests
            from google.oauth2 import id_token as google_id_token

            decoded = google_id_token.verify_firebase_token(
                token,
                google_requests.Request(),
                audience=project_id,
            )
            uid = decoded.get("user_id") or decoded.get("sub")
            if uid:
                email = decoded.get("email")
                user = FirebaseUser(uid=str(uid), email=str(email) if email else None)
        except Exception as exc:
            logger.warning("Firebase token verification failed: %s", exc)

    if user is not None:
        if len(_token_cache) > 256:
            _token_cache.clear()
        _token_cache[token] = (user, now + _TOKEN_CACHE_TTL_SECONDS)
        from app.billing.checkout_timing import timing_enabled

        if timing_enabled():
            logger.info(
                "checkout timing token_verify=%.0fms uid=%s",
                (time.monotonic() - verify_start) * 1000,
                user.uid,
            )
    return user


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
    _ensure_db()
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
    _ensure_db()
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
    _ensure_db()
    if _db is None:
        return None
    return _db.collection("users").document(uid).collection("private").document("billing")


def load_user_billing(uid: str) -> Dict[str, object]:
    now = time.monotonic()
    cached = _billing_cache.get(uid)
    if cached and now - cached[0] < _BILLING_CACHE_TTL_SECONDS:
        return dict(cached[1])

    ref = _billing_ref(uid)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if not snap.exists:
            result: Dict[str, object] = {}
        else:
            result = snap.to_dict() or {}
        _billing_cache[uid] = (now, result)
        return dict(result)
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
        _billing_cache.pop(uid, None)
    except Exception as exc:
        logger.warning("Failed to save billing for %s: %s", uid, exc)


def _usage_ref(uid: str):
    _ensure_db()
    if _db is None:
        return None
    return _db.collection("users").document(uid).collection("private").document("usage")


def load_user_on_demand_limit(uid: str) -> Optional[float]:
    """Plafond USD au-delà du forfait Pro. None = illimité."""
    _ensure_db()
    if _db is None:
        return None
    try:
        snap = _db.collection("users").document(uid).get()
        if not snap.exists:
            return None
        raw = (snap.to_dict() or {}).get("onDemandLimitUsd")
        if raw is None:
            return None
        if isinstance(raw, (int, float)) and float(raw) > 0:
            return float(raw)
    except Exception as exc:
        logger.warning("Failed to load on-demand limit for %s: %s", uid, exc)
    return None


def set_user_on_demand_limit(uid: str, limit_usd: Optional[float]) -> None:
    """None = plafond illimité au-delà du forfait Pro."""
    _ensure_db()
    if _db is None:
        return
    try:
        from firebase_admin import firestore

        payload: Dict[str, object] = {"updatedAt": firestore.SERVER_TIMESTAMP}
        if limit_usd is None:
            payload["onDemandLimitUsd"] = None
        else:
            payload["onDemandLimitUsd"] = round(max(float(limit_usd), 1.0), 2)
        _db.collection("users").document(uid).set(payload, merge=True)
    except Exception as exc:
        logger.warning("Failed to set on-demand limit for %s: %s", uid, exc)


def get_user_subscription_state(uid: str) -> tuple[str, bool, bool]:
    """Returns (plan, billing_managed, on_demand_enabled)."""
    _ensure_db()
    plan = "free"
    billing_managed = False
    on_demand = False
    if _db is None:
        return plan, billing_managed, on_demand
    try:
        snap = _db.collection("users").document(uid).get()
        if snap.exists:
            data = snap.to_dict() or {}
            raw_plan = str(data.get("subscriptionPlan") or "free")
            billing_managed = bool(data.get("billingManaged"))
            on_demand = bool(data.get("onDemandUsageEnabled"))
            if raw_plan == "pro" and billing_managed:
                plan = "pro"
    except Exception as exc:
        logger.warning("Failed to load subscription state for %s: %s", uid, exc)
    return plan, billing_managed, on_demand


def load_user_usage(uid: str) -> Dict[str, object]:
    ref = _usage_ref(uid)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if not snap.exists:
            return {}
        return snap.to_dict() or {}
    except Exception as exc:
        logger.warning("Failed to load usage for %s: %s", uid, exc)
        return {}


def _apply_usage_delta(existing: Dict[str, object], delta: Dict[str, object]) -> Dict[str, object]:
    used_retail = float(existing.get("usedUsdRetail") or 0.0) + float(delta.get("usedUsdRetail") or 0.0)
    on_demand_retail = float(existing.get("onDemandUsedUsdRetail") or 0.0) + float(
        delta.get("onDemandUsedUsdRetail") or 0.0
    )
    used_provider = float(existing.get("usedUsdProvider") or 0.0) + float(delta.get("usedUsdProvider") or 0.0)
    input_tokens = int(existing.get("inputTokens") or 0) + int(delta.get("inputTokens") or 0)
    output_tokens = int(existing.get("outputTokens") or 0) + int(delta.get("outputTokens") or 0)
    usage_by_model = dict(existing.get("usageByModel") or {})
    model_key = str(delta.get("modelKey") or "").strip()
    if model_key:
        row = dict(usage_by_model.get(model_key) or {})
        row["inputTokens"] = int(row.get("inputTokens") or 0) + int(delta.get("inputTokens") or 0)
        row["outputTokens"] = int(row.get("outputTokens") or 0) + int(delta.get("outputTokens") or 0)
        row["usedUsdRetail"] = float(row.get("usedUsdRetail") or 0.0) + float(delta.get("usedUsdRetail") or 0.0)
        row["onDemandUsedUsdRetail"] = float(row.get("onDemandUsedUsdRetail") or 0.0) + float(
            delta.get("onDemandUsedUsdRetail") or 0.0
        )
        row["usedUsdProvider"] = float(row.get("usedUsdProvider") or 0.0) + float(
            delta.get("usedUsdProvider") or 0.0
        )
        usage_by_model[model_key] = row
    payload: Dict[str, object] = {
        "usedUsdRetail": used_retail,
        "onDemandUsedUsdRetail": on_demand_retail,
        "usedUsdProvider": used_provider,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "usageByModel": usage_by_model,
    }
    if delta.get("lastModel"):
        payload["lastModel"] = delta.get("lastModel")
    if delta.get("lastUsedAt"):
        payload["lastUsedAt"] = delta.get("lastUsedAt")
    if delta.get("lastUid"):
        payload["lastUid"] = delta.get("lastUid")
    return payload


def record_user_usage(uid: str, delta: Dict[str, object]) -> None:
    ref = _usage_ref(uid)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        snap = ref.get()
        existing = snap.to_dict() if snap.exists else {}
        payload = _apply_usage_delta(existing, delta)
        payload["updatedAt"] = firestore.SERVER_TIMESTAMP
        if not existing.get("allowanceUsdRetail"):
            from app.ai.usage_pricing import pro_usage_allowance_usd

            payload["allowanceUsdRetail"] = pro_usage_allowance_usd()
        ref.set(payload, merge=True)
    except Exception as exc:
        logger.warning("Failed to record usage for %s: %s", uid, exc)


def reset_user_usage_period(
    uid: str,
    *,
    allowance_usd: float,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    stripe_period_start: Optional[int] = None,
) -> None:
    ref = _usage_ref(uid)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        payload: Dict[str, object] = {
            "allowanceUsdRetail": float(allowance_usd),
            "usedUsdRetail": 0.0,
            "onDemandUsedUsdRetail": 0.0,
            "usedUsdProvider": 0.0,
            "inputTokens": 0,
            "outputTokens": 0,
            "usageByModel": {},
            "periodStart": period_start or firestore.SERVER_TIMESTAMP,
            "periodEnd": period_end,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if stripe_period_start is not None:
            payload["stripePeriodStart"] = int(stripe_period_start)
        ref.set(payload, merge=True)
        save_user_billing(uid, {"stripeOnDemandUnitsReported": 0})
    except Exception as exc:
        logger.warning("Failed to reset usage period for %s: %s", uid, exc)


def _workspace_usage_ref(workspace_id: str):
    _ensure_db()
    if _db is None:
        return None
    wid = workspace_id.strip().lower()
    if not wid:
        return None
    return (
        _db.collection("workspacesShared")
        .document(wid)
        .collection("private")
        .document("usage")
    )


def get_workspace_enterprise_state(
    workspace_id: str,
) -> tuple[str, bool, int, int]:
    """Returns (plan, billing_managed, member_count, seat_count)."""
    wid = workspace_id.strip().lower()
    workspace = load_shared_workspace(wid)
    if not workspace:
        return "free", False, 0, 0
    billing_managed = bool(workspace.get("enterpriseBillingManaged"))
    raw_plan = str(workspace.get("enterpriseSubscriptionPlan") or "free")
    plan = "enterprise" if raw_plan == "enterprise" and billing_managed else "free"
    member_count = int(workspace.get("enterpriseMemberCount") or 0)
    seat_count = int(workspace.get("enterpriseSeatCount") or 0)
    if member_count <= 0:
        member_count = count_workspace_members(wid, workspace)
    if seat_count <= 0:
        seat_count = max(member_count, 1)
    return plan, billing_managed, member_count, seat_count


def is_workspace_member(uid: str, workspace_id: str) -> bool:
    wid = workspace_id.strip().lower()
    if not uid or not wid:
        return False
    workspace = load_shared_workspace(wid)
    if not workspace:
        return False
    if str(workspace.get("ownerId") or "").strip() == uid:
        return True
    _ensure_db()
    if _db is None:
        return False
    try:
        snap = (
            _db.collection("workspacesShared")
            .document(wid)
            .collection("members")
            .document(uid)
            .get()
        )
        return snap.exists
    except Exception as exc:
        logger.warning("Failed to check workspace membership for %s in %s: %s", uid, wid, exc)
        return False


def load_workspace_usage(workspace_id: str) -> Dict[str, object]:
    ref = _workspace_usage_ref(workspace_id)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if not snap.exists:
            return {}
        return snap.to_dict() or {}
    except Exception as exc:
        logger.warning("Failed to load workspace usage for %s: %s", workspace_id, exc)
        return {}


def record_workspace_usage(workspace_id: str, delta: Dict[str, object]) -> None:
    ref = _workspace_usage_ref(workspace_id)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        from app.ai.usage_pricing import enterprise_usage_allowance_usd

        snap = ref.get()
        existing = snap.to_dict() if snap.exists else {}
        payload = _apply_usage_delta(existing, delta)
        payload["updatedAt"] = firestore.SERVER_TIMESTAMP
        if not existing.get("allowanceUsdRetail"):
            _, _, _, seat_count = get_workspace_enterprise_state(workspace_id)
            payload["allowanceUsdRetail"] = enterprise_usage_allowance_usd(seat_count)
            payload["seatCount"] = seat_count
        ref.set(payload, merge=True)
    except Exception as exc:
        logger.warning("Failed to record workspace usage for %s: %s", workspace_id, exc)


def reset_workspace_usage_period(
    workspace_id: str,
    *,
    allowance_usd: float,
    seat_count: int,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    stripe_period_start: Optional[int] = None,
) -> None:
    ref = _workspace_usage_ref(workspace_id)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        payload: Dict[str, object] = {
            "allowanceUsdRetail": float(allowance_usd),
            "seatCount": max(int(seat_count or 0), 1),
            "usedUsdRetail": 0.0,
            "usedUsdProvider": 0.0,
            "inputTokens": 0,
            "outputTokens": 0,
            "usageByModel": {},
            "periodStart": period_start or firestore.SERVER_TIMESTAMP,
            "periodEnd": period_end,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if stripe_period_start is not None:
            payload["stripePeriodStart"] = int(stripe_period_start)
        ref.set(payload, merge=True)
    except Exception as exc:
        logger.warning("Failed to reset workspace usage period for %s: %s", workspace_id, exc)


def update_user_subscription_profile(
    uid: str,
    *,
    subscription_plan: str,
    on_demand_usage_enabled: bool,
    billing_managed: bool = True,
) -> None:
    _ensure_db()
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
    _ensure_db()
    if _db is None or not customer_id:
        return None
    try:
        query = (
            _db.collection_group("private")
            .where("stripeCustomerId", "==", customer_id)
            .limit(10)
            .stream()
        )
        for doc in query:
            parent = doc.reference.parent.parent
            if parent is None:
                continue
            if parent.parent.id == "users":
                return str(parent.id)
    except Exception as exc:
        logger.warning("Stripe customer lookup failed for %s: %s", customer_id, exc)
    return None


def _workspace_billing_ref(workspace_id: str):
    _ensure_db()
    if _db is None:
        return None
    wid = workspace_id.strip().lower()
    if not wid:
        return None
    return (
        _db.collection("workspacesShared")
        .document(wid)
        .collection("private")
        .document("billing")
    )


def load_shared_workspace(workspace_id: str) -> Dict[str, object]:
    _ensure_db()
    if _db is None:
        return {}
    wid = workspace_id.strip().lower()
    if not wid:
        return {}
    try:
        snap = _db.collection("workspacesShared").document(wid).get()
        if not snap.exists:
            return {}
        data = snap.to_dict() or {}
        data["id"] = wid
        return data
    except Exception as exc:
        logger.warning("Failed to load workspace %s: %s", wid, exc)
        return {}


def count_workspace_members(
    workspace_id: str,
    workspace: Optional[Dict[str, object]] = None,
) -> int:
    ws = workspace or load_shared_workspace(workspace_id)
    if not ws:
        return 0
    wid = str(ws.get("id") or workspace_id).strip().lower()
    owner_id = str(ws.get("ownerId") or "").strip()
    _ensure_db()
    if _db is None:
        return 1 if owner_id else 0

    members_in_subcollection = 0
    try:
        count_result = (
            _db.collection("workspacesShared")
            .document(wid)
            .collection("members")
            .count()
            .get()
        )
        if count_result:
            members_in_subcollection = int(count_result[0][0].value)
    except Exception as exc:
        logger.debug("Member count aggregation failed for %s: %s", wid, exc)
        member_uids = set()
        if owner_id:
            member_uids.add(owner_id)
        try:
            docs = _db.collection("workspacesShared").document(wid).collection("members").stream()
            for doc in docs:
                data = doc.to_dict() or {}
                uid = str(data.get("uid") or doc.id or "").strip()
                if uid:
                    member_uids.add(uid)
        except Exception as stream_exc:
            logger.warning("Failed to count members for workspace %s: %s", wid, stream_exc)
            return len(member_uids)
        return len(member_uids)

    if not owner_id:
        return members_in_subcollection
    return max(members_in_subcollection + 1, 1)


def assert_workspace_owner(uid: str, workspace_id: str) -> Dict[str, object]:
    workspace = load_shared_workspace(workspace_id)
    if not workspace:
        raise ValueError("Workspace introuvable.")
    owner_id = str(workspace.get("ownerId") or "").strip()
    if owner_id != uid:
        raise ValueError("Seul le propriétaire du workspace peut gérer l'abonnement Entreprise.")
    return workspace


def load_workspace_billing(workspace_id: str) -> Dict[str, object]:
    cache_key = workspace_id.strip().lower()
    now = time.monotonic()
    cached = _billing_cache.get(f"ws:{cache_key}")
    if cached and now - cached[0] < _BILLING_CACHE_TTL_SECONDS:
        return dict(cached[1])

    ref = _workspace_billing_ref(workspace_id)
    if ref is None:
        return {}
    try:
        snap = ref.get()
        if not snap.exists:
            result: Dict[str, object] = {}
        else:
            result = snap.to_dict() or {}
        _billing_cache[f"ws:{cache_key}"] = (now, result)
        return dict(result)
    except Exception as exc:
        logger.warning("Failed to load workspace billing for %s: %s", workspace_id, exc)
        return {}


def save_workspace_billing(workspace_id: str, data: Dict[str, object]) -> None:
    ref = _workspace_billing_ref(workspace_id)
    if ref is None:
        return
    try:
        from firebase_admin import firestore

        ref.set({**data, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
        _billing_cache.pop(f"ws:{workspace_id.strip().lower()}", None)
    except Exception as exc:
        logger.warning("Failed to save workspace billing for %s: %s", workspace_id, exc)


def update_workspace_enterprise_profile(
    workspace_id: str,
    *,
    subscription_plan: str,
    billing_managed: bool = True,
    member_count: Optional[int] = None,
    seat_count: Optional[int] = None,
) -> None:
    _ensure_db()
    if _db is None:
        return
    wid = workspace_id.strip().lower()
    if not wid:
        return
    try:
        from firebase_admin import firestore

        payload: Dict[str, object] = {
            "enterpriseSubscriptionPlan": subscription_plan,
            "enterpriseBillingManaged": billing_managed,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if member_count is not None:
            payload["enterpriseMemberCount"] = member_count
        if seat_count is not None:
            payload["enterpriseSeatCount"] = seat_count
        _db.collection("workspacesShared").document(wid).set(payload, merge=True)
    except Exception as exc:
        logger.warning("Failed to update enterprise profile for %s: %s", wid, exc)


def find_workspace_by_stripe_customer(customer_id: str) -> Optional[str]:
    _ensure_db()
    if _db is None or not customer_id:
        return None
    try:
        query = (
            _db.collection_group("private")
            .where("stripeCustomerId", "==", customer_id)
            .limit(10)
            .stream()
        )
        for doc in query:
            parent = doc.reference.parent.parent
            if parent is None:
                continue
            if parent.parent.id == "workspacesShared":
                return str(parent.id)
    except Exception as exc:
        logger.warning("Stripe workspace customer lookup failed for %s: %s", customer_id, exc)
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
