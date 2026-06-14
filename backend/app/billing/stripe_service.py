"""Logique Stripe : checkout, portail client et synchronisation webhook."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Tuple

from app.connectors.registry import frontend_origin
from app.core.config import settings
from app.core.firebase import (
    find_uid_by_stripe_customer,
    load_user_billing,
    save_user_billing,
    update_user_subscription_profile,
)

logger = logging.getLogger(__name__)

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due"}


def _stripe():
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


def _billing_urls() -> Tuple[str, str]:
    origin = frontend_origin()
    return (
        f"{origin}/settings?tab=billing&checkout=success",
        f"{origin}/settings?tab=billing&checkout=cancel",
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
    logger.info(
        "Synced Stripe subscription for %s: plan=%s on_demand=%s status=%s",
        uid,
        plan,
        on_demand,
        subscription.get("status"),
    )


def handle_checkout_completed(session: Dict[str, Any]) -> None:
    uid = _resolve_uid(
        metadata=session.get("metadata"),
        client_reference_id=session.get("client_reference_id"),
        customer_id=str(session.get("customer") or ""),
    )
    if not uid:
        logger.warning("checkout.session.completed without firebase uid: %s", session.get("id"))
        return

    customer_id = str(session.get("customer") or "")
    subscription_id = str(session.get("subscription") or "")
    if customer_id:
        save_user_billing(uid, {"stripeCustomerId": customer_id})

    if not subscription_id:
        return

    stripe = _stripe()
    subscription = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
    sync_subscription_for_uid(uid, subscription)


def handle_subscription_event(subscription: Dict[str, Any]) -> None:
    uid = _resolve_uid(
        metadata=subscription.get("metadata"),
        customer_id=str(subscription.get("customer") or ""),
    )
    if not uid:
        customer_id = str(subscription.get("customer") or "")
        uid = find_uid_by_stripe_customer(customer_id) if customer_id else None
    if not uid:
        logger.warning(
            "subscription event without firebase uid: %s",
            subscription.get("id"),
        )
        return
    sync_subscription_for_uid(uid, subscription)


def handle_subscription_deleted(subscription: Dict[str, Any]) -> None:
    uid = _resolve_uid(customer_id=str(subscription.get("customer") or ""))
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
    stripe = _stripe()
    customer_id = create_or_get_customer(uid, email)
    success_url, cancel_url = _billing_urls()
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        client_reference_id=uid,
        metadata={"firebase_uid": uid, "intent": "pro"},
        line_items=[{"price": settings.stripe_pro_price_id, "quantity": 1}],
        subscription_data={"metadata": {"firebase_uid": uid}},
        success_url=success_url,
        cancel_url=cancel_url,
        allow_promotion_codes=True,
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


def enable_on_demand(uid: str) -> None:
    if not settings.stripe_on_demand_price_id.strip():
        raise ValueError("Add-on usage à la demande non configuré.")
    billing = load_user_billing(uid)
    existing_item = str(billing.get("stripeOnDemandItemId") or "").strip()
    if existing_item:
        return

    stripe = _stripe()
    subscription_id = _active_subscription_id(uid)
    item = stripe.SubscriptionItem.create(
        subscription=subscription_id,
        price=settings.stripe_on_demand_price_id,
        metadata={"firebase_uid": uid, "intent": "on_demand"},
    )
    subscription = stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
    sync_subscription_for_uid(uid, subscription)
    save_user_billing(uid, {"stripeOnDemandItemId": str(item["id"])})


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


def create_portal_session(uid: str) -> str:
    billing = load_user_billing(uid)
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    if not customer_id:
        raise ValueError("Aucun client Stripe associé.")
    stripe = _stripe()
    success_url, _ = _billing_urls()
    session = stripe.billing_portal.Session.create(
        customer=customer_id,
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
