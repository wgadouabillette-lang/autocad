"""Logique Stripe : checkout, portail client et synchronisation webhook."""
from __future__ import annotations

import logging
import math
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional, Tuple

from app.billing.checkout_timing import checkout_step, timing_enabled
from app.connectors.registry import frontend_origin
from app.core.config import settings
from app.core.firebase import (
    assert_workspace_owner,
    count_workspace_members,
    find_uid_by_stripe_customer,
    find_workspace_by_stripe_customer,
    load_user_billing,
    load_workspace_billing,
    save_user_billing,
    save_workspace_billing,
    update_user_subscription_profile,
    update_workspace_enterprise_profile,
)

logger = logging.getLogger(__name__)

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}
_stripe_module = None


def _stripe():
    global _stripe_module
    if _stripe_module is None:
        import stripe

        stripe.api_key = settings.stripe_secret_key
        stripe.max_network_retries = 1
        _stripe_module = stripe
    return _stripe_module


def _billing_urls() -> Tuple[str, str]:
    origin = frontend_origin().rstrip("/")
    # SPA Vite (base /app/) — query params lus au boot dans App.tsx
    return (
        f"{origin}/app/?tab=usage&checkout=success",
        f"{origin}/app/?tab=usage&checkout=cancel",
    )


def _subscription_items(subscription: Dict[str, Any]) -> list[Dict[str, Any]]:
    items = subscription.get("items")
    if isinstance(items, dict):
        data = items.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    return []


def _price_id(item: Dict[str, Any]) -> str:
    price = item.get("price")
    if isinstance(price, dict):
        return str(price.get("id") or "")
    return ""


def _subscription_state(subscription: Dict[str, Any]) -> Tuple[str, bool, str]:
    status = str(subscription.get("status") or "")
    pro_price = settings.stripe_pro_price_id.strip()
    on_demand_price = settings.stripe_on_demand_price_id.strip()
    has_pro = False
    has_on_demand = False
    on_demand_item_id = ""

    for item in _subscription_items(subscription):
        price_id = _price_id(item)
        if price_id == pro_price:
            has_pro = True
        if on_demand_price and price_id == on_demand_price:
            has_on_demand = True
            on_demand_item_id = str(item.get("id") or "")

    is_active = status in ACTIVE_SUBSCRIPTION_STATUSES
    subscription_plan = "pro" if is_active and has_pro else "free"
    on_demand_enabled = is_active and has_pro and has_on_demand
    return subscription_plan, on_demand_enabled, on_demand_item_id


def _enterprise_subscription_state(subscription: Dict[str, Any]) -> Tuple[str, int]:
    status = str(subscription.get("status") or "")
    enterprise_price = settings.stripe_enterprise_seat_price_id.strip()
    seat_count = 0
    has_enterprise = False

    for item in _subscription_items(subscription):
        price_id = _price_id(item)
        if price_id == enterprise_price:
            has_enterprise = True
            seat_count = int(item.get("quantity") or 0)

    is_active = status in ACTIVE_SUBSCRIPTION_STATUSES
    plan = "enterprise" if is_active and has_enterprise else "free"
    return plan, seat_count


def _resolve_workspace_id(metadata: Optional[Dict[str, Any]] = None) -> Optional[str]:
    meta = metadata or {}
    workspace_id = str(meta.get("workspace_id") or meta.get("workspaceId") or "").strip().lower()
    return workspace_id or None


def _is_enterprise_intent(metadata: Optional[Dict[str, Any]] = None) -> bool:
    meta = metadata or {}
    intent = str(meta.get("intent") or "").strip().lower()
    if intent == "enterprise":
        return True
    return bool(_resolve_workspace_id(meta))


def _resolve_uid(
    *,
    metadata: Optional[Dict[str, Any]] = None,
    client_reference_id: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> Optional[str]:
    meta = metadata or {}
    uid = str(meta.get("firebase_uid") or meta.get("firebaseUid") or "").strip()
    if uid:
        return uid
    ref = (client_reference_id or "").strip()
    if ref:
        return ref
    if customer_id:
        return find_uid_by_stripe_customer(customer_id)
    return None


def sync_subscription_for_uid(uid: str, subscription: Dict[str, Any]) -> None:
    plan, on_demand, on_demand_item_id = _subscription_state(subscription)
    customer_id = str(subscription.get("customer") or "")
    subscription_id = str(subscription.get("id") or "")

    update_user_subscription_profile(
        uid,
        subscription_plan=plan,
        on_demand_usage_enabled=on_demand,
        billing_managed=True,
    )
    save_user_billing(
        uid,
        {
            "stripeCustomerId": customer_id,
            "stripeSubscriptionId": subscription_id,
            "stripeOnDemandItemId": on_demand_item_id,
            "stripeSubscriptionStatus": str(subscription.get("status") or ""),
        },
    )
    if plan == "pro":
        from app.ai.usage import maybe_sync_usage_period

        maybe_sync_usage_period(uid, subscription)
    logger.info(
        "Synced Stripe subscription for %s: plan=%s on_demand=%s status=%s",
        uid,
        plan,
        on_demand,
        subscription.get("status"),
    )


def sync_enterprise_subscription_for_workspace(
    workspace_id: str,
    subscription: Dict[str, Any],
    *,
    paid_by_uid: Optional[str] = None,
) -> None:
    plan, seat_count = _enterprise_subscription_state(subscription)
    customer_id = str(subscription.get("customer") or "")
    subscription_id = str(subscription.get("id") or "")
    member_count = count_workspace_members(workspace_id)

    update_workspace_enterprise_profile(
        workspace_id,
        subscription_plan=plan,
        billing_managed=True,
        member_count=member_count,
        seat_count=seat_count or member_count,
    )
    billing_patch: Dict[str, Any] = {
        "stripeCustomerId": customer_id,
        "stripeSubscriptionId": subscription_id,
        "stripeSubscriptionStatus": str(subscription.get("status") or ""),
        "seatCount": seat_count or member_count,
    }
    if paid_by_uid:
        billing_patch["paidByUid"] = paid_by_uid
    save_workspace_billing(workspace_id, billing_patch)
    if plan == "enterprise":
        from app.ai.usage import maybe_sync_workspace_usage_period

        maybe_sync_workspace_usage_period(workspace_id, subscription, seat_count or member_count)
    logger.info(
        "Synced enterprise subscription for workspace %s: plan=%s seats=%s status=%s",
        workspace_id,
        plan,
        seat_count,
        subscription.get("status"),
    )


def handle_checkout_completed(session: Dict[str, Any]) -> None:
    metadata = session.get("metadata") or {}
    workspace_id = _resolve_workspace_id(metadata)
    uid = _resolve_uid(
        metadata=metadata,
        client_reference_id=session.get("client_reference_id"),
        customer_id=str(session.get("customer") or ""),
    )

    customer_id = str(session.get("customer") or "")
    subscription_id = str(session.get("subscription") or "")
    if not subscription_id:
        return

    stripe = _stripe()
    subscription = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])

    if _is_enterprise_intent(metadata) and workspace_id:
        if customer_id:
            save_workspace_billing(workspace_id, {"stripeCustomerId": customer_id})
        sync_enterprise_subscription_for_workspace(
            workspace_id,
            subscription,
            paid_by_uid=uid,
        )
        return

    if not uid:
        logger.warning("checkout.session.completed without firebase uid: %s", session.get("id"))
        return

    if customer_id:
        save_user_billing(uid, {"stripeCustomerId": customer_id})
    sync_subscription_for_uid(uid, subscription)


def handle_subscription_event(subscription: Dict[str, Any]) -> None:
    metadata = subscription.get("metadata") or {}
    workspace_id = _resolve_workspace_id(metadata)
    if _is_enterprise_intent(metadata) and workspace_id:
        sync_enterprise_subscription_for_workspace(workspace_id, subscription)
        return

    customer_id = str(subscription.get("customer") or "")
    if not workspace_id and customer_id:
        workspace_id = find_workspace_by_stripe_customer(customer_id)
    if workspace_id:
        enterprise_price = settings.stripe_enterprise_seat_price_id.strip()
        for item in _subscription_items(subscription):
            if _price_id(item) == enterprise_price:
                sync_enterprise_subscription_for_workspace(workspace_id, subscription)
                return

    uid = _resolve_uid(
        metadata=metadata,
        customer_id=customer_id,
    )
    if not uid:
        uid = find_uid_by_stripe_customer(customer_id) if customer_id else None
    if not uid:
        logger.warning(
            "subscription event without firebase uid: %s",
            subscription.get("id"),
        )
        return
    sync_subscription_for_uid(uid, subscription)


def handle_subscription_deleted(subscription: Dict[str, Any]) -> None:
    metadata = subscription.get("metadata") or {}
    workspace_id = _resolve_workspace_id(metadata)
    customer_id = str(subscription.get("customer") or "")
    if not workspace_id and customer_id:
        workspace_id = find_workspace_by_stripe_customer(customer_id)

    if workspace_id:
        enterprise_price = settings.stripe_enterprise_seat_price_id.strip()
        for item in _subscription_items(subscription):
            if _price_id(item) == enterprise_price or _is_enterprise_intent(metadata):
                update_workspace_enterprise_profile(
                    workspace_id,
                    subscription_plan="free",
                    billing_managed=True,
                    seat_count=0,
                )
                save_workspace_billing(
                    workspace_id,
                    {
                        "stripeSubscriptionId": "",
                        "stripeSubscriptionStatus": "canceled",
                        "seatCount": 0,
                    },
                )
                return

    uid = _resolve_uid(customer_id=customer_id)
    if not uid:
        return
    update_user_subscription_profile(
        uid,
        subscription_plan="free",
        on_demand_usage_enabled=False,
        billing_managed=True,
    )
    save_user_billing(
        uid,
        {
            "stripeSubscriptionId": "",
            "stripeOnDemandItemId": "",
            "stripeSubscriptionStatus": "canceled",
        },
    )


def create_or_get_customer(uid: str, email: Optional[str]) -> str:
    billing = load_user_billing(uid)
    existing = str(billing.get("stripeCustomerId") or "").strip()
    if existing:
        return existing

    stripe = _stripe()
    customer = stripe.Customer.create(
        email=email,
        metadata={"firebase_uid": uid},
    )
    save_user_billing(uid, {"stripeCustomerId": customer["id"]})
    return str(customer["id"])


def create_pro_checkout_session(uid: str, email: Optional[str]) -> str:
    total_start = time.perf_counter()
    stripe = _stripe()

    with checkout_step("firestore_billing", uid=uid):
        billing = load_user_billing(uid)

    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    existing_sub_id = str(billing.get("stripeSubscriptionId") or "").strip()
    existing_status = str(billing.get("stripeSubscriptionStatus") or "").strip()

    # Portail uniquement si le webhook a déjà marqué l'abonnement actif — pas d'appel Stripe.retrieve.
    if (
        customer_id
        and existing_sub_id
        and existing_status in ACTIVE_SUBSCRIPTION_STATUSES
    ):
        with checkout_step("stripe_portal", uid=uid):
            return create_portal_session(uid, customer_id=customer_id)

    success_url, cancel_url = _billing_urls()
    session_params: Dict[str, Any] = {
        "mode": "subscription",
        "client_reference_id": uid,
        "metadata": {"firebase_uid": uid, "intent": "pro"},
        "line_items": [{"price": settings.stripe_pro_price_id, "quantity": 1}],
        "subscription_data": {"metadata": {"firebase_uid": uid}},
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": True,
    }
    if customer_id:
        session_params["customer"] = customer_id
    elif email and email.strip():
        session_params["customer_email"] = email.strip()

    with checkout_step("stripe_checkout_create", uid=uid):
        session = stripe.checkout.Session.create(**session_params)

    if timing_enabled():
        logger.info(
            "checkout/pro total=%.0fms uid=%s",
            (time.perf_counter() - total_start) * 1000,
            uid,
        )
    return str(session["url"])


def create_or_get_workspace_customer(
    workspace_id: str,
    uid: str,
    email: Optional[str],
) -> str:
    billing = load_workspace_billing(workspace_id)
    existing = str(billing.get("stripeCustomerId") or "").strip()
    if existing:
        return existing

    stripe = _stripe()
    customer = stripe.Customer.create(
        email=email,
        metadata={"workspace_id": workspace_id, "firebase_uid": uid, "intent": "enterprise"},
    )
    save_workspace_billing(
        workspace_id,
        {"stripeCustomerId": customer["id"], "paidByUid": uid},
    )
    return str(customer["id"])


def list_enterprise_workspaces_for_owner(uid: str) -> list[Dict[str, Any]]:
    from app.core.firebase import _ensure_db, _db

    _ensure_db()
    if _db is None:
        return []

    min_members = settings.stripe_enterprise_min_members
    workspaces: list[Dict[str, Any]] = []
    try:
        docs = (
            _db.collection("workspacesShared")
            .where("ownerId", "==", uid)
            .stream()
        )
        for doc in docs:
            data = doc.to_dict() or {}
            workspace_id = str(doc.id)
            workspace = {**data, "id": workspace_id}
            member_count = count_workspace_members(workspace_id, workspace)
            enterprise_plan = str(data.get("enterpriseSubscriptionPlan") or "free")
            enterprise_managed = bool(data.get("enterpriseBillingManaged"))
            enterprise_active = enterprise_managed and enterprise_plan == "enterprise"
            workspaces.append(
                {
                    "workspaceId": workspace_id,
                    "name": str(data.get("name") or workspace_id),
                    "memberCount": member_count,
                    "minMembers": min_members,
                    "eligible": member_count >= min_members,
                    "enterpriseActive": enterprise_active,
                }
            )
    except Exception as exc:
        logger.warning("Failed to list enterprise workspaces for %s: %s", uid, exc)
    workspaces.sort(key=lambda item: (-int(item["memberCount"]), str(item["name"]).lower()))
    return workspaces


def create_enterprise_checkout_session(
    uid: str,
    email: Optional[str],
    workspace_id: str,
) -> str:
    if not settings.stripe_enterprise_seat_price_id.strip():
        raise ValueError("Abonnement Entreprise non configuré côté serveur.")

    total_start = time.perf_counter()
    wid = workspace_id.strip().lower()

    with checkout_step("firestore_workspace", uid=uid):
        workspace = assert_workspace_owner(uid, wid)

    with checkout_step("firestore_parallel", uid=uid):
        with ThreadPoolExecutor(max_workers=2) as pool:
            billing_future = pool.submit(load_workspace_billing, wid)
            count_future = pool.submit(count_workspace_members, wid, workspace)
            billing = billing_future.result()
            member_count = count_future.result()

    min_members = settings.stripe_enterprise_min_members

    if member_count < min_members:
        raise ValueError(
            f"L'abonnement Entreprise requiert au moins {min_members} membres "
            f"(actuellement {member_count})."
        )

    stripe = _stripe()
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    existing_sub_id = str(billing.get("stripeSubscriptionId") or "").strip()
    existing_status = str(billing.get("stripeSubscriptionStatus") or "").strip()

    if (
        customer_id
        and existing_sub_id
        and existing_status in ACTIVE_SUBSCRIPTION_STATUSES
        and str(workspace.get("enterpriseSubscriptionPlan") or "") == "enterprise"
    ):
        with checkout_step("stripe_portal", uid=uid):
            return create_enterprise_portal_session(uid, wid)

    success_url, cancel_url = _billing_urls()
    session_params: Dict[str, Any] = {
        "mode": "subscription",
        "client_reference_id": wid,
        "metadata": {
            "firebase_uid": uid,
            "workspace_id": wid,
            "intent": "enterprise",
        },
        "line_items": [
            {
                "price": settings.stripe_enterprise_seat_price_id,
                "quantity": member_count,
            }
        ],
        "subscription_data": {
            "metadata": {
                "firebase_uid": uid,
                "workspace_id": wid,
                "intent": "enterprise",
            }
        },
        "success_url": success_url,
        "cancel_url": cancel_url,
        "allow_promotion_codes": True,
    }
    if customer_id:
        session_params["customer"] = customer_id
    elif email and email.strip():
        session_params["customer_email"] = email.strip()

    with checkout_step("stripe_checkout_create", uid=uid):
        session = stripe.checkout.Session.create(**session_params)

    if timing_enabled():
        logger.info(
            "checkout/enterprise total=%.0fms uid=%s workspace=%s",
            (time.perf_counter() - total_start) * 1000,
            uid,
            wid,
        )
    return str(session["url"])


def create_enterprise_portal_session(uid: str, workspace_id: str) -> str:
    wid = workspace_id.strip().lower()
    assert_workspace_owner(uid, wid)
    billing = load_workspace_billing(wid)
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    if not customer_id:
        raise ValueError("Aucun client Stripe associé à ce workspace.")
    stripe = _stripe()
    success_url, _ = _billing_urls()
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
        return_url=success_url,
    )
    return str(session["url"])


def _active_subscription_id(uid: str) -> str:
    billing = load_user_billing(uid)
    subscription_id = str(billing.get("stripeSubscriptionId") or "").strip()
    if not subscription_id:
        raise ValueError("Aucun abonnement Pro actif.")
    stripe = _stripe()
    subscription = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
    plan, _, _ = _subscription_state(subscription)
    if plan != "pro":
        raise ValueError("Abonnement Pro requis.")
    return subscription_id


def _on_demand_overage_units(overage_usd: float) -> int:
    unit_cents = max(int(settings.stripe_on_demand_unit_cents), 1)
    overage_cents = max(0.0, float(overage_usd)) * 100.0
    return max(0, math.ceil(overage_cents / unit_cents))


def report_on_demand_stripe_usage(uid: str, on_demand_used_usd: float) -> None:
    """Envoie à Stripe la consommation on-demand (tarif ×1.65, add-on metered)."""
    if not settings.stripe_on_demand_price_id.strip():
        return
    target_units = _on_demand_overage_units(on_demand_used_usd)
    if target_units <= 0:
        return

    billing = load_user_billing(uid)
    item_id = str(billing.get("stripeOnDemandItemId") or "").strip()
    if not item_id:
        return

    reported = int(billing.get("stripeOnDemandUnitsReported") or 0)
    delta = target_units - reported
    if delta <= 0:
        return

    stripe = _stripe()
    stripe.SubscriptionItem.create_usage_record(
        item_id,
        quantity=delta,
        action="increment",
        timestamp=int(time.time()),
    )
    save_user_billing(uid, {"stripeOnDemandUnitsReported": target_units})
    logger.info(
        "Reported on-demand Stripe usage for %s: +%s units ($%.4f on-demand retail)",
        uid,
        delta,
        on_demand_used_usd,
    )


def enable_on_demand(uid: str, *, limit_usd: Optional[float] = 25.0) -> None:
    if not settings.stripe_on_demand_price_id.strip():
        raise ValueError("Add-on usage à la demande non configuré.")
    from app.core.firebase import set_user_on_demand_limit

    billing = load_user_billing(uid)
    existing_item = str(billing.get("stripeOnDemandItemId") or "").strip()
    if not existing_item:
        stripe = _stripe()
        subscription_id = _active_subscription_id(uid)
        item = stripe.SubscriptionItem.create(
            subscription=subscription_id,
            price=settings.stripe_on_demand_price_id,
            metadata={"firebase_uid": uid, "intent": "on_demand"},
        )
        subscription = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
        sync_subscription_for_uid(uid, subscription)
        save_user_billing(
            uid,
            {
                "stripeOnDemandItemId": str(item["id"]),
                "stripeOnDemandUnitsReported": 0,
            },
        )

    set_user_on_demand_limit(uid, limit_usd)


def set_on_demand_limit(uid: str, limit_usd: Optional[float]) -> None:
    from app.core.firebase import get_user_subscription_state, set_user_on_demand_limit

    plan, billing_managed, on_demand = get_user_subscription_state(uid)
    if plan != "pro" or not billing_managed or not on_demand:
        raise ValueError("L'usage à la demande doit être actif.")
    set_user_on_demand_limit(uid, limit_usd)


def disable_on_demand(uid: str) -> None:
    billing = load_user_billing(uid)
    item_id = str(billing.get("stripeOnDemandItemId") or "").strip()
    if not item_id:
        update_user_subscription_profile(
            uid,
            subscription_plan="pro",
            on_demand_usage_enabled=False,
            billing_managed=True,
        )
        return

    stripe = _stripe()
    stripe.SubscriptionItem.delete(item_id)
    subscription_id = str(billing.get("stripeSubscriptionId") or "").strip()
    if subscription_id:
        subscription = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
        sync_subscription_for_uid(uid, subscription)
    else:
        update_user_subscription_profile(
            uid,
            subscription_plan="pro",
            on_demand_usage_enabled=False,
            billing_managed=True,
        )


def create_portal_session(uid: str, *, customer_id: str | None = None) -> str:
    resolved_customer = (customer_id or "").strip()
    if not resolved_customer:
        billing = load_user_billing(uid)
        resolved_customer = str(billing.get("stripeCustomerId") or "").strip()
    if not resolved_customer:
        raise ValueError("Aucun client Stripe associé.")
    stripe = _stripe()
    success_url, _ = _billing_urls()
    session = stripe.billing_portal.Session.create(
        customer=resolved_customer,
        return_url=success_url,
    )
    return str(session["url"])


def verify_and_dispatch_webhook(payload: bytes, signature: str) -> None:
    stripe = _stripe()
    event = stripe.Webhook.construct_event(
        payload,
        signature,
        settings.stripe_webhook_secret,
    )
    event_type = str(event.get("type") or "")
    data_object = (event.get("data") or {}).get("object") or {}

    if event_type == "checkout.session.completed":
        handle_checkout_completed(data_object)
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
    }:
        handle_subscription_event(data_object)
    elif event_type == "customer.subscription.deleted":
        handle_subscription_deleted(data_object)
