"""Logique Stripe : checkout, portail client et synchronisation webhook."""
from __future__ import annotations

import logging
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional, Tuple

from app.billing.checkout_timing import checkout_step, timing_enabled
from app.billing.webhook_events import (
    WebhookAlreadyProcessed,
    claim_stripe_webhook_event,
    mark_stripe_webhook_processed,
    release_stripe_webhook_claim,
)
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
    status = str(subscription.get("status") or "")
    # Pro uniquement si l'abonnement est réellement actif (paiement OK).
    # incomplete / canceled → free, sans billingManaged.
    billing_managed = plan == "pro"

    update_user_subscription_profile(
        uid,
        subscription_plan=plan,
        on_demand_usage_enabled=on_demand if billing_managed else False,
        billing_managed=billing_managed,
    )
    save_user_billing(
        uid,
        {
            "stripeCustomerId": customer_id,
            "stripeSubscriptionId": subscription_id if billing_managed else "",
            "stripeOnDemandItemId": on_demand_item_id if billing_managed else "",
            "stripeSubscriptionStatus": status,
        },
    )
    if plan == "pro":
        from app.ai.usage import maybe_sync_usage_period

        maybe_sync_usage_period(uid, subscription)
    logger.info(
        "Synced Stripe subscription for %s: plan=%s on_demand=%s status=%s managed=%s",
        uid,
        plan,
        on_demand,
        status,
        billing_managed,
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
        "cancelAtPeriodEnd": bool(subscription.get("cancel_at_period_end")),
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


def _validate_checkout_session(session: Dict[str, Any]) -> None:
    mode = str(session.get("mode") or "")
    if mode != "subscription":
        raise ValueError(f"Unexpected checkout mode: {mode}")
    payment_status = str(session.get("payment_status") or "")
    if payment_status not in {"paid", "no_payment_required"}:
        raise ValueError(f"Checkout session not paid: {payment_status}")


def handle_checkout_completed(session: Dict[str, Any]) -> None:
    _validate_checkout_session(session)
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
        billing_managed=False,
    )
    save_user_billing(
        uid,
        {
            "stripeSubscriptionId": "",
            "stripeOnDemandItemId": "",
            "stripeSubscriptionStatus": "canceled",
        },
    )


def _customer_firebase_uid(customer: Dict[str, Any]) -> str:
    metadata = customer.get("metadata") if isinstance(customer, dict) else None
    if not isinstance(metadata, dict):
        return ""
    return str(metadata.get("firebase_uid") or "").strip()


def _customer_belongs_to_uid(customer: Dict[str, Any], uid: str) -> bool:
    """Un client Stripe n'est réutilisable que s'il est explicitement lié à ce Firebase uid."""
    if not isinstance(customer, dict) or customer.get("deleted"):
        return False
    meta_uid = _customer_firebase_uid(customer)
    return bool(meta_uid) and meta_uid == uid


def _clear_stale_user_billing(uid: str) -> None:
    save_user_billing(
        uid,
        {
            "stripeCustomerId": "",
            "stripeSubscriptionId": "",
            "stripeOnDemandItemId": "",
            "stripeSubscriptionStatus": "",
        },
    )
    update_user_subscription_profile(
        uid,
        subscription_plan="free",
        on_demand_usage_enabled=False,
        billing_managed=False,
    )


def create_or_get_customer(uid: str, email: Optional[str]) -> str:
    billing = load_user_billing(uid)
    existing = str(billing.get("stripeCustomerId") or "").strip()
    if existing:
        stripe = _stripe()
        try:
            customer = stripe.Customer.retrieve(existing)
            if _customer_belongs_to_uid(customer, uid):
                return existing
            logger.info(
                "Ignoring stale Stripe customer %s for uid %s (metadata mismatch).",
                existing,
                uid,
            )
            _clear_stale_user_billing(uid)
        except Exception as exc:
            logger.info("Stored Stripe customer %s invalid for %s: %s", existing, uid, exc)
            _clear_stale_user_billing(uid)

    stripe = _stripe()
    customer = stripe.Customer.create(
        email=email,
        metadata={"firebase_uid": uid},
    )
    save_user_billing(uid, {"stripeCustomerId": customer["id"]})
    return str(customer["id"])


def _resolve_customer_id(uid: str, email: Optional[str]) -> Optional[str]:
    """Trouve le `stripeCustomerId` du user (Firestore, puis metadata Firebase — jamais un autre compte)."""
    billing = load_user_billing(uid)
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    stripe = _stripe()

    if customer_id:
        try:
            customer = stripe.Customer.retrieve(customer_id)
            if _customer_belongs_to_uid(customer, uid):
                return customer_id
            logger.info(
                "Dropping Stripe customer %s for uid %s — belongs to another Firebase account.",
                customer_id,
                uid,
            )
            _clear_stale_user_billing(uid)
        except Exception as exc:
            logger.info("Stored Stripe customer %s missing for %s: %s", customer_id, uid, exc)
            _clear_stale_user_billing(uid)

    try:
        search = stripe.Customer.search(
            query=f'metadata["firebase_uid"]:"{uid}"',
            limit=1,
        )
        data = list(search.get("data") or [])
        if data and _customer_belongs_to_uid(data[0], uid):
            customer_id = str(data[0].get("id") or "").strip()
            if customer_id:
                save_user_billing(uid, {"stripeCustomerId": customer_id})
                return customer_id
    except Exception as exc:
        logger.debug("Stripe customer search by metadata failed for %s: %s", uid, exc)

    # Ne jamais rattacher un client Stripe uniquement par email : après suppression
    # de compte, le même email peut encore pointer vers l'ancien customer/abonnement.
    if email and email.strip():
        logger.debug(
            "Skipping Stripe customer email lookup for %s (%s) — require firebase_uid metadata.",
            uid,
            email.strip(),
        )

    return None


def purge_stripe_for_deleted_account(uid: str, email: Optional[str] = None) -> None:
    """Annule les abonnements et supprime les customers Stripe liés à ce Firebase uid."""
    if not settings.stripe_secret_key.strip():
        return

    stripe = _stripe()
    customer_ids: set[str] = set()

    billing = load_user_billing(uid)
    stored = str(billing.get("stripeCustomerId") or "").strip()
    if stored:
        customer_ids.add(stored)

    try:
        search = stripe.Customer.search(
            query=f'metadata["firebase_uid"]:"{uid}"',
            limit=20,
        )
        for customer in search.get("data") or []:
            cid = str(customer.get("id") or "").strip()
            if cid:
                customer_ids.add(cid)
    except Exception as exc:
        logger.warning("Stripe customer search during account delete failed for %s: %s", uid, exc)

    if email and email.strip():
        try:
            listing = stripe.Customer.list(email=email.strip(), limit=20)
            for customer in listing.get("data") or []:
                if not isinstance(customer, dict):
                    continue
                cid = str(customer.get("id") or "").strip()
                meta_uid = _customer_firebase_uid(customer)
                # Supprime les customers de ce uid, et les orphelins sans metadata
                # (créés avant le tracking firebase_uid) pour le même email.
                if cid and (meta_uid == uid or not meta_uid):
                    customer_ids.add(cid)
        except Exception as exc:
            logger.warning("Stripe customer email purge failed for %s: %s", uid, exc)

    for customer_id in customer_ids:
        try:
            subs = stripe.Subscription.list(customer=customer_id, status="all", limit=100)
            for sub in subs.get("data") or []:
                sub_id = str(sub.get("id") or "").strip()
                status = str(sub.get("status") or "").strip()
                if not sub_id or status in {"canceled", "incomplete_expired"}:
                    continue
                try:
                    stripe.Subscription.cancel(sub_id)
                except Exception as exc:
                    logger.warning("Stripe cancel %s failed during account delete: %s", sub_id, exc)
        except Exception as exc:
            logger.warning(
                "Stripe list subscriptions failed for %s during account delete: %s",
                customer_id,
                exc,
            )
        try:
            stripe.Customer.delete(customer_id)
            logger.info("Deleted Stripe customer %s for account %s", customer_id, uid)
        except Exception as exc:
            logger.warning(
                "Stripe customer delete failed for %s during account delete: %s",
                customer_id,
                exc,
            )


def _pick_user_subscription(subscriptions: list[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Choisit un abonnement Pro actif uniquement (ignore incomplete / unpaid)."""
    if not subscriptions:
        return None
    pro_price = settings.stripe_pro_price_id.strip()

    def has_pro_item(sub: Dict[str, Any]) -> bool:
        if not pro_price:
            return False
        for item in _subscription_items(sub):
            if _price_id(item) == pro_price:
                return True
        return False

    active = [
        s
        for s in subscriptions
        if str(s.get("status") or "") in ACTIVE_SUBSCRIPTION_STATUSES and has_pro_item(s)
    ]
    if not active:
        return None
    active.sort(key=lambda s: int(s.get("created") or 0), reverse=True)
    return active[0]


def sync_user_subscription_from_stripe(uid: str, email: Optional[str] = None) -> Dict[str, Any]:
    """
    Filet de sécurité indépendant des webhooks: interroge Stripe et met à jour Firestore.

    Retourne `{ "subscriptionPlan": "pro"|"free", "stripeSubscriptionStatus": str|None,
    "billingManaged": bool }`.
    """
    customer_id = _resolve_customer_id(uid, email)
    if not customer_id:
        return {
            "subscriptionPlan": "free",
            "stripeSubscriptionStatus": None,
            "billingManaged": False,
        }

    stripe = _stripe()
    try:
        listing = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=10,
            expand=["data.items.data.price"],
        )
    except Exception as exc:
        logger.warning("Stripe subscription list failed for %s (customer %s): %s", uid, customer_id, exc)
        raise

    subscriptions = list(listing.get("data") or [])
    chosen = _pick_user_subscription(subscriptions)
    if chosen is None:
        # Pas d'abonnement Stripe: assurer la cohérence Firestore en plan "free".
        update_user_subscription_profile(
            uid,
            subscription_plan="free",
            on_demand_usage_enabled=False,
            billing_managed=False,
        )
        save_user_billing(
            uid,
            {
                "stripeCustomerId": customer_id,
                "stripeSubscriptionId": "",
                "stripeOnDemandItemId": "",
                "stripeSubscriptionStatus": "",
            },
        )
        return {
            "subscriptionPlan": "free",
            "stripeSubscriptionStatus": None,
            "billingManaged": False,
        }

    sync_subscription_for_uid(uid, chosen)
    plan, on_demand, _ = _subscription_state(chosen)
    billing_managed = plan == "pro"
    return {
        "subscriptionPlan": plan,
        "stripeSubscriptionStatus": str(chosen.get("status") or "") or None,
        "billingManaged": billing_managed,
        "onDemandUsageEnabled": on_demand if billing_managed else False,
    }


def _client_secret_from_obj(obj: Any) -> str:
    if isinstance(obj, dict):
        return str(obj.get("client_secret") or "").strip()
    return ""


def _subscription_client_secret(subscription: Dict[str, Any]) -> str:
    """Extrait le client_secret PaymentIntent / SetupIntent d'un abonnement incomplete.

    API Stripe ≥ 2025-03-31.basil : le PI n'est plus sur ``invoice.payment_intent`` ;
    utiliser ``invoice.confirmation_secret.client_secret`` (à expand).
    """
    stripe = _stripe()

    pending_setup = subscription.get("pending_setup_intent")
    if isinstance(pending_setup, dict):
        secret = _client_secret_from_obj(pending_setup)
        if secret:
            return secret
    elif isinstance(pending_setup, str) and pending_setup.strip():
        setup = stripe.SetupIntent.retrieve(pending_setup)
        secret = _client_secret_from_obj(setup)
        if secret:
            return secret

    invoice = subscription.get("latest_invoice")
    if isinstance(invoice, str) and invoice.strip():
        invoice = stripe.Invoice.retrieve(
            invoice,
            expand=["confirmation_secret", "payment_intent", "payments.data.payment.payment_intent"],
        )
    if not isinstance(invoice, dict):
        raise ValueError("Impossible d'initialiser le paiement Stripe (facture manquante).")

    # API Basil+ : secret de confirmation directement sur la facture
    confirmation = invoice.get("confirmation_secret")
    secret = _client_secret_from_obj(confirmation)
    if secret:
        return secret

    # Anciennes API : payment_intent sur la facture
    payment_intent = invoice.get("payment_intent")
    if isinstance(payment_intent, dict):
        secret = _client_secret_from_obj(payment_intent)
        if secret:
            return secret
    elif isinstance(payment_intent, str) and payment_intent.strip():
        pi = stripe.PaymentIntent.retrieve(payment_intent)
        secret = _client_secret_from_obj(pi)
        if secret:
            return secret

    # Fallback Invoice Payments (paiements partiels)
    payments = invoice.get("payments")
    if isinstance(payments, dict):
        for row in payments.get("data") or []:
            if not isinstance(row, dict):
                continue
            payment = row.get("payment")
            if not isinstance(payment, dict):
                continue
            pi = payment.get("payment_intent")
            if isinstance(pi, dict):
                secret = _client_secret_from_obj(pi)
                if secret:
                    return secret
            elif isinstance(pi, str) and pi.strip():
                retrieved = stripe.PaymentIntent.retrieve(pi)
                secret = _client_secret_from_obj(retrieved)
                if secret:
                    return secret

    raise ValueError("Impossible d'initialiser le paiement Stripe (client_secret manquant).")


def create_pro_subscription_intent(uid: str, email: Optional[str]) -> Dict[str, str]:
    """Crée un abonnement Pro incomplete et renvoie le client_secret pour Payment Element."""
    publishable = settings.stripe_publishable_key.strip()
    if not publishable:
        raise ValueError("STRIPE_PUBLISHABLE_KEY is not configured.")
    pro_price = settings.stripe_pro_price_id.strip()
    if not pro_price:
        raise ValueError("STRIPE_PRO_PRICE_ID is not configured.")

    stripe = _stripe()
    # Sync live: évite un faux « déjà Pro » après suppression/recréation de compte.
    live = sync_user_subscription_from_stripe(uid, email)
    if (
        str(live.get("subscriptionPlan") or "") == "pro"
        and bool(live.get("billingManaged"))
        and str(live.get("stripeSubscriptionStatus") or "") in ACTIVE_SUBSCRIPTION_STATUSES
    ):
        raise ValueError(
            "Un abonnement Pro est déjà actif. Utilisez le portail de facturation."
        )

    customer_id = create_or_get_customer(uid, email)

    # Évite d'accumuler des abonnements incomplete
    try:
        incomplete = stripe.Subscription.list(
            customer=customer_id,
            status="incomplete",
            limit=10,
            expand=["data.items.data.price"],
        )
        for sub in incomplete.get("data") or []:
            if not isinstance(sub, dict):
                continue
            plan, _, _ = _subscription_state(sub)
            if plan == "pro" or any(_price_id(item) == pro_price for item in _subscription_items(sub)):
                try:
                    stripe.Subscription.cancel(str(sub.get("id") or ""))
                except Exception as exc:
                    logger.debug("Cancel incomplete Pro sub failed: %s", exc)
    except Exception as exc:
        logger.debug("List incomplete subscriptions failed for %s: %s", uid, exc)

    # Dynamic payment methods (Dashboard) — pas de payment_method_types hardcodés.
    # Config optionnelle : STRIPE_PAYMENT_METHOD_CONFIGURATION=pmc_...
    pmc = settings.stripe_payment_method_configuration.strip()
    create_params: Dict[str, Any] = {
        "customer": customer_id,
        "items": [{"price": pro_price}],
        "payment_behavior": "default_incomplete",
        "payment_settings": {
            "save_default_payment_method": "on_subscription",
        },
        "metadata": {"firebase_uid": uid, "intent": "pro"},
        "expand": ["latest_invoice.confirmation_secret", "pending_setup_intent"],
    }
    if pmc:
        create_params["payment_method_configuration"] = pmc
    subscription = stripe.Subscription.create(**create_params)
    client_secret = _subscription_client_secret(subscription)
    sub_id = str(subscription.get("id") or "").strip()
    status = str(subscription.get("status") or "incomplete")

    save_user_billing(
        uid,
        {
            "stripeCustomerId": customer_id,
            "stripeSubscriptionId": sub_id,
            "stripeSubscriptionStatus": status,
        },
    )

    return {
        "clientSecret": client_secret,
        "publishableKey": publishable,
        "subscriptionId": sub_id,
    }


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
    wid = workspace_id.strip().lower()
    billing = load_workspace_billing(wid)
    existing = str(billing.get("stripeCustomerId") or "").strip()
    stripe = _stripe()

    if existing:
        try:
            customer = stripe.Customer.retrieve(existing)
            if isinstance(customer, dict) and not customer.get("deleted"):
                meta = customer.get("metadata") if isinstance(customer.get("metadata"), dict) else {}
                meta_wid = str((meta or {}).get("workspace_id") or "").strip().lower()
                if not meta_wid or meta_wid == wid:
                    return existing
            logger.info(
                "Ignoring stale Stripe workspace customer %s for workspace %s.",
                existing,
                wid,
            )
        except Exception as exc:
            logger.info("Stored workspace Stripe customer %s invalid for %s: %s", existing, wid, exc)
        save_workspace_billing(
            wid,
            {
                "stripeCustomerId": "",
                "stripeSubscriptionId": "",
                "stripeSubscriptionStatus": "",
            },
        )

    customer = stripe.Customer.create(
        email=email,
        metadata={"workspace_id": wid, "firebase_uid": uid, "intent": "enterprise"},
    )
    save_workspace_billing(
        wid,
        {"stripeCustomerId": customer["id"], "paidByUid": uid},
    )
    return str(customer["id"])


def sync_workspace_subscription_from_stripe(workspace_id: str) -> Dict[str, Any]:
    """Filet de sécurité: lit Stripe pour un workspace et met à jour Firestore."""
    wid = workspace_id.strip().lower()
    if not wid:
        raise ValueError("workspaceId requis.")

    billing = load_workspace_billing(wid)
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    if not customer_id:
        update_workspace_enterprise_profile(
            wid,
            subscription_plan="free",
            billing_managed=False,
            member_count=count_workspace_members(wid),
            seat_count=0,
        )
        return {
            "workspaceId": wid,
            "subscriptionPlan": "free",
            "billingManaged": False,
            "stripeSubscriptionStatus": None,
            "seatCount": 0,
        }

    stripe = _stripe()
    enterprise_price = settings.stripe_enterprise_seat_price_id.strip()
    try:
        listing = stripe.Subscription.list(
            customer=customer_id,
            status="all",
            limit=20,
            expand=["data.items.data.price"],
        )
    except Exception as exc:
        logger.warning(
            "Stripe workspace subscription list failed for %s (customer %s): %s",
            wid,
            customer_id,
            exc,
        )
        raise

    chosen: Optional[Dict[str, Any]] = None
    candidates: list[Dict[str, Any]] = []
    for sub in listing.get("data") or []:
        if not isinstance(sub, dict):
            continue
        status = str(sub.get("status") or "")
        if status not in ACTIVE_SUBSCRIPTION_STATUSES:
            continue
        meta = sub.get("metadata") if isinstance(sub.get("metadata"), dict) else {}
        if _is_enterprise_intent(meta) or any(
            _price_id(item) == enterprise_price for item in _subscription_items(sub)
        ):
            candidates.append(sub)
    if candidates:
        candidates.sort(key=lambda s: int(s.get("created") or 0), reverse=True)
        chosen = candidates[0]

    if chosen is None:
        update_workspace_enterprise_profile(
            wid,
            subscription_plan="free",
            billing_managed=False,
            member_count=count_workspace_members(wid),
            seat_count=0,
        )
        save_workspace_billing(
            wid,
            {
                "stripeCustomerId": customer_id,
                "stripeSubscriptionId": "",
                "stripeSubscriptionStatus": "",
                "seatCount": 0,
            },
        )
        return {
            "workspaceId": wid,
            "subscriptionPlan": "free",
            "billingManaged": False,
            "stripeSubscriptionStatus": None,
            "seatCount": 0,
        }

    sync_enterprise_subscription_for_workspace(wid, chosen)
    plan, seat_count = _enterprise_subscription_state(chosen)
    return {
        "workspaceId": wid,
        "subscriptionPlan": plan,
        "billingManaged": plan == "enterprise",
        "stripeSubscriptionStatus": str(chosen.get("status") or "") or None,
        "seatCount": seat_count or count_workspace_members(wid),
    }


def _enterprise_seat_unit_cents() -> int:
    raw = (os.getenv("STRIPE_ENTERPRISE_SEAT_AMOUNT_CENTS") or "1800").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 1800


def _enterprise_seat_price_label() -> str:
    return (
        os.getenv("STRIPE_ENTERPRISE_SEAT_PRICE_LABEL", "$18 / seat").strip()
        or "$18 / seat"
    )


def _format_usd_from_cents(cents: int) -> str:
    dollars = cents / 100.0
    if dollars == int(dollars):
        return f"${int(dollars)}"
    return f"${dollars:.2f}"


def create_enterprise_subscription_intent(
    uid: str,
    email: Optional[str],
    workspace_id: str,
    seat_count: Optional[int] = None,
) -> Dict[str, Any]:
    """Crée un abonnement Entreprise incomplete (quantity = sièges choisis) pour Payment Element."""
    publishable = settings.stripe_publishable_key.strip()
    if not publishable:
        raise ValueError("STRIPE_PUBLISHABLE_KEY is not configured.")
    enterprise_price = settings.stripe_enterprise_seat_price_id.strip()
    if not enterprise_price:
        raise ValueError("Abonnement Entreprise non configuré côté serveur.")

    wid = workspace_id.strip().lower()
    workspace = assert_workspace_owner(uid, wid)
    member_count = count_workspace_members(wid, workspace)
    min_members = settings.stripe_enterprise_min_members
    min_seats = max(min_members, member_count, 1)
    max_seats = 500

    requested = int(seat_count) if seat_count is not None else min_seats
    if requested < min_seats:
        raise ValueError(
            f"Choisissez au moins {min_seats} siège{'s' if min_seats > 1 else ''} "
            f"(membres actuels : {member_count})."
        )
    if requested > max_seats:
        raise ValueError(f"Maximum {max_seats} sièges.")

    live = sync_workspace_subscription_from_stripe(wid)
    if (
        str(live.get("subscriptionPlan") or "") == "enterprise"
        and bool(live.get("billingManaged"))
        and str(live.get("stripeSubscriptionStatus") or "") in ACTIVE_SUBSCRIPTION_STATUSES
    ):
        raise ValueError(
            "Un abonnement Entreprise est déjà actif pour ce workspace. "
            "Utilisez le portail de facturation."
        )

    stripe = _stripe()
    customer_id = create_or_get_workspace_customer(wid, uid, email)

    try:
        incomplete = stripe.Subscription.list(
            customer=customer_id,
            status="incomplete",
            limit=10,
            expand=["data.items.data.price"],
        )
        for sub in incomplete.get("data") or []:
            if not isinstance(sub, dict):
                continue
            meta = sub.get("metadata") if isinstance(sub.get("metadata"), dict) else {}
            if _is_enterprise_intent(meta) or any(
                _price_id(item) == enterprise_price for item in _subscription_items(sub)
            ):
                try:
                    stripe.Subscription.cancel(str(sub.get("id") or ""))
                except Exception as exc:
                    logger.debug("Cancel incomplete Enterprise sub failed: %s", exc)
    except Exception as exc:
        logger.debug("List incomplete enterprise subscriptions failed for %s: %s", wid, exc)

    pmc = settings.stripe_payment_method_configuration.strip()
    create_params: Dict[str, Any] = {
        "customer": customer_id,
        "items": [{"price": enterprise_price, "quantity": requested}],
        "payment_behavior": "default_incomplete",
        "payment_settings": {
            "save_default_payment_method": "on_subscription",
        },
        "metadata": {
            "firebase_uid": uid,
            "workspace_id": wid,
            "intent": "enterprise",
            "seat_count": str(requested),
        },
        "expand": ["latest_invoice.confirmation_secret", "pending_setup_intent"],
    }
    if pmc:
        create_params["payment_method_configuration"] = pmc
    subscription = stripe.Subscription.create(**create_params)
    client_secret = _subscription_client_secret(subscription)
    sub_id = str(subscription.get("id") or "").strip()
    status = str(subscription.get("status") or "incomplete")

    save_workspace_billing(
        wid,
        {
            "stripeCustomerId": customer_id,
            "stripeSubscriptionId": sub_id,
            "stripeSubscriptionStatus": status,
            "paidByUid": uid,
            "seatCount": requested,
        },
    )

    workspace_name = str(workspace.get("name") or wid).strip() or wid
    unit_cents = _enterprise_seat_unit_cents()
    total_cents = unit_cents * requested
    seat_label = _enterprise_seat_price_label()
    unit_amount_label = _format_usd_from_cents(unit_cents)
    total_amount_label = _format_usd_from_cents(total_cents)
    price_label = f"{total_amount_label} / month"

    return {
        "clientSecret": client_secret,
        "publishableKey": publishable,
        "subscriptionId": sub_id,
        "workspaceId": wid,
        "workspaceName": workspace_name,
        "seatCount": requested,
        "memberCount": member_count,
        "minSeats": min_seats,
        "seatPriceLabel": seat_label,
        "unitAmountCents": unit_cents,
        "totalAmountCents": total_cents,
        "unitAmountLabel": unit_amount_label,
        "totalAmountLabel": total_amount_label,
        "priceLabel": price_label,
    }


def list_enterprise_workspaces_for_owner(uid: str) -> list[Dict[str, Any]]:
    """Liste les workspaces accessibles pour Entreprise / Boost.

    Inclut :
    - les workspaces dont l'utilisateur est propriétaire (boostables) ;
    - les workspaces dont il est membre et qui sont déjà boostés
      (visibilité partagée : l'IA est utilisable par tous jusqu'à la limite).
    """
    from app.core.firebase import _ensure_db, _db

    _ensure_db()
    if _db is None:
        return []

    min_members = settings.stripe_enterprise_min_members
    by_id: Dict[str, Dict[str, Any]] = {}

    def _upsert(workspace_id: str, data: Dict[str, Any], *, is_owner: bool) -> None:
        wid = workspace_id.strip().lower()
        if not wid:
            return
        workspace = {**data, "id": wid}
        member_count = count_workspace_members(wid, workspace)
        enterprise_plan = str(data.get("enterpriseSubscriptionPlan") or "free")
        enterprise_managed = bool(data.get("enterpriseBillingManaged"))
        enterprise_active = enterprise_managed and enterprise_plan == "enterprise"
        existing = by_id.get(wid)
        if existing:
            existing["isOwner"] = bool(existing.get("isOwner")) or is_owner
            if is_owner:
                existing["eligible"] = member_count >= min_members
                existing["memberCount"] = member_count
                existing["name"] = str(data.get("name") or existing.get("name") or wid)
                existing["enterpriseActive"] = enterprise_active
            return
        by_id[wid] = {
            "workspaceId": wid,
            "name": str(data.get("name") or wid),
            "memberCount": member_count,
            "minMembers": min_members,
            "eligible": is_owner and member_count >= min_members,
            "enterpriseActive": enterprise_active,
            "isOwner": is_owner,
            "paidByMe": False,
            "cancelAtPeriodEnd": False,
            "canCancel": False,
        }

    try:
        owned_docs = (
            _db.collection("workspacesShared")
            .where("ownerId", "==", uid)
            .stream()
        )
        for doc in owned_docs:
            _upsert(str(doc.id), doc.to_dict() or {}, is_owner=True)
    except Exception as exc:
        logger.warning("Failed to list owned enterprise workspaces for %s: %s", uid, exc)

    # Workspaces locaux persistés + memberships (membre d'un serveur boosté par un autre).
    candidate_ids: set[str] = set()
    try:
        for doc in _db.collection("users").document(uid).collection("workspaces").stream():
            candidate_ids.add(str(doc.id).strip().lower())
    except Exception as exc:
        logger.debug("Failed to list user workspaces for %s: %s", uid, exc)
    try:
        for doc in _db.collection("users").document(uid).collection("memberships").stream():
            data = doc.to_dict() or {}
            wid = str(data.get("workspaceId") or doc.id).strip().lower()
            if wid:
                candidate_ids.add(wid)
    except Exception as exc:
        logger.debug("Failed to list user memberships for %s: %s", uid, exc)

    for wid in candidate_ids:
        if wid in by_id:
            continue
        try:
            snap = _db.collection("workspacesShared").document(wid).get()
            if not snap.exists:
                continue
            data = snap.to_dict() or {}
            owner_id = str(data.get("ownerId") or "").strip()
            is_owner = owner_id == uid
            enterprise_plan = str(data.get("enterpriseSubscriptionPlan") or "free")
            enterprise_managed = bool(data.get("enterpriseBillingManaged"))
            enterprise_active = enterprise_managed and enterprise_plan == "enterprise"
            # Membres : n'exposer que les workspaces déjà boostés (lecture partagée).
            if not is_owner and not enterprise_active:
                continue
            _upsert(wid, data, is_owner=is_owner)
        except Exception as exc:
            logger.debug("Failed to load shared workspace %s for %s: %s", wid, uid, exc)

    workspaces = list(by_id.values())
    for item in workspaces:
        wid = str(item.get("workspaceId") or "")
        if not wid or not item.get("enterpriseActive"):
            continue
        billing = load_workspace_billing(wid)
        paid_by = str(billing.get("paidByUid") or "").strip()
        # Contributeur = payeur Stripe ; repli owner si ancien abo sans paidByUid.
        paid_by_me = paid_by == uid or (not paid_by and bool(item.get("isOwner")))
        cancel_at_end = bool(billing.get("cancelAtPeriodEnd"))
        item["paidByMe"] = paid_by_me
        item["cancelAtPeriodEnd"] = cancel_at_end
        item["canCancel"] = paid_by_me and not cancel_at_end

    workspaces.sort(
        key=lambda item: (
            0 if item.get("enterpriseActive") else 1,
            -int(item["memberCount"]),
            str(item["name"]).lower(),
        )
    )
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


def create_portal_session(
    uid: str,
    *,
    customer_id: str | None = None,
    email: Optional[str] = None,
) -> str:
    resolved_customer = (customer_id or "").strip()
    if not resolved_customer:
        resolved_customer = _resolve_customer_id(uid, email) or ""
    if not resolved_customer:
        raise ValueError("Aucun client Stripe associé.")
    stripe = _stripe()
    success_url, _ = _billing_urls()
    session = stripe.billing_portal.Session.create(
        customer=resolved_customer,
        return_url=success_url,
    )
    return str(session["url"])


def _format_invoice_amount(invoice: Dict[str, Any]) -> str:
    amount_cents = int(invoice.get("amount_paid") or invoice.get("amount_due") or 0)
    currency = str(invoice.get("currency") or "usd").upper()
    if currency == "USD":
        return f"${amount_cents / 100:.2f}"
    return f"{amount_cents / 100:.2f} {currency}"


def _invoice_date_iso(invoice: Dict[str, Any]) -> str:
    from datetime import datetime, timezone

    created = int(invoice.get("created") or 0)
    if not created:
        return ""
    return datetime.fromtimestamp(created, tz=timezone.utc).isoformat()


def _list_customer_invoices(customer_id: str, *, limit: int = 24) -> list[Dict[str, Any]]:
    if not settings.stripe_secret_key.strip():
        return []
    resolved = customer_id.strip()
    if not resolved:
        return []
    stripe = _stripe()
    try:
        listing = stripe.Invoice.list(customer=resolved, limit=limit)
    except Exception as exc:
        logger.warning("Invoice list failed for customer %s: %s", resolved, exc)
        return []

    rows: list[Dict[str, Any]] = []
    for invoice in listing.get("data") or []:
        description = str(invoice.get("description") or "").strip()
        if not description:
            description = f"Facture {invoice.get('number') or invoice.get('id') or ''}".strip()
        rows.append(
            {
                "id": str(invoice.get("id") or ""),
                "date": _invoice_date_iso(invoice),
                "description": description or "Facture",
                "amountLabel": _format_invoice_amount(invoice),
                "status": str(invoice.get("status") or "unknown"),
                "invoiceUrl": str(invoice.get("hosted_invoice_url") or "") or None,
            }
        )
    return rows


def list_user_billing_transactions(uid: str, *, limit: int = 24) -> list[Dict[str, Any]]:
    billing = load_user_billing(uid)
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    return _list_customer_invoices(customer_id, limit=limit)


def list_workspace_billing_transactions(workspace_id: str, *, limit: int = 24) -> list[Dict[str, Any]]:
    wid = workspace_id.strip().lower()
    billing = load_workspace_billing(wid)
    customer_id = str(billing.get("stripeCustomerId") or "").strip()
    return _list_customer_invoices(customer_id, limit=limit)


def _subscription_period_details(subscription: Dict[str, Any]) -> Dict[str, Optional[Any]]:
    from datetime import datetime, timezone

    period_end_ts = subscription.get("current_period_end")
    period_end_iso = (
        datetime.fromtimestamp(int(period_end_ts), tz=timezone.utc).isoformat()
        if period_end_ts
        else None
    )
    return {
        "nextBillingDate": period_end_iso,
        "cancelAtPeriodEnd": bool(subscription.get("cancel_at_period_end")),
    }


def get_pro_subscription_details(uid: str) -> Dict[str, Optional[Any]]:
    billing = load_user_billing(uid)
    subscription_id = str(billing.get("stripeSubscriptionId") or "").strip()
    if not subscription_id or not settings.stripe_secret_key.strip():
        return {"nextBillingDate": None, "cancelAtPeriodEnd": False}
    stripe = _stripe()
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
    except Exception as exc:
        logger.warning("Subscription retrieve failed for %s: %s", uid, exc)
        return {"nextBillingDate": None, "cancelAtPeriodEnd": False}
    return _subscription_period_details(subscription)


def get_enterprise_subscription_details(workspace_id: str) -> Dict[str, Optional[Any]]:
    wid = workspace_id.strip().lower()
    billing = load_workspace_billing(wid)
    subscription_id = str(billing.get("stripeSubscriptionId") or "").strip()
    if not subscription_id or not settings.stripe_secret_key.strip():
        return {"nextBillingDate": None, "cancelAtPeriodEnd": False}
    stripe = _stripe()
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
    except Exception as exc:
        logger.warning("Enterprise subscription retrieve failed for %s: %s", wid, exc)
        return {"nextBillingDate": None, "cancelAtPeriodEnd": False}
    return _subscription_period_details(subscription)


def cancel_pro_subscription_at_period_end(uid: str) -> None:
    if not settings.stripe_secret_key.strip():
        raise ValueError("Stripe billing is not configured.")
    subscription_id = _active_subscription_id(uid)
    stripe = _stripe()
    stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)


def cancel_enterprise_subscription_at_period_end(uid: str, workspace_id: str) -> None:
    if not settings.stripe_secret_key.strip():
        raise ValueError("Stripe billing is not configured.")
    wid = workspace_id.strip().lower()
    billing = load_workspace_billing(wid)
    paid_by = str(billing.get("paidByUid") or "").strip()
    is_owner = False
    try:
        assert_workspace_owner(uid, wid)
        is_owner = True
    except ValueError:
        is_owner = False
    if not is_owner and paid_by != uid:
        raise ValueError(
            "Seul le contributeur qui a payé les sièges (ou le propriétaire) "
            "peut annuler cet abonnement."
        )
    subscription_id = str(billing.get("stripeSubscriptionId") or "").strip()
    if not subscription_id:
        raise ValueError("Aucun abonnement Entreprise actif pour ce workspace.")
    stripe = _stripe()
    stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
    save_workspace_billing(wid, {"cancelAtPeriodEnd": True})


class WebhookSignatureError(ValueError):
    """Signature Stripe invalide ou payload rejeté avant traitement."""


def _dispatch_stripe_event(event_type: str, data_object: Dict[str, Any]) -> None:
    if event_type == "checkout.session.completed":
        handle_checkout_completed(data_object)
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
    }:
        handle_subscription_event(data_object)
    elif event_type == "customer.subscription.deleted":
        handle_subscription_deleted(data_object)
    else:
        logger.debug("Ignored Stripe webhook event type: %s", event_type)


def verify_and_dispatch_webhook(payload: bytes, signature: str) -> None:
    if not payload:
        raise WebhookSignatureError("Missing request body.")
    if not signature.strip():
        raise WebhookSignatureError("Missing Stripe signature.")

    stripe = _stripe()
    try:
        event = stripe.Webhook.construct_event(
            payload,
            signature,
            settings.stripe_webhook_secret,
        )
    except stripe.error.SignatureVerificationError as exc:
        raise WebhookSignatureError("Invalid Stripe webhook signature.") from exc

    event_id = str(event.get("id") or "").strip()
    event_type = str(event.get("type") or "")
    data_object = (event.get("data") or {}).get("object") or {}

    try:
        claim_stripe_webhook_event(event_id, event_type)
    except WebhookAlreadyProcessed:
        logger.info("Skipping duplicate Stripe webhook event %s", event_id)
        return

    try:
        _dispatch_stripe_event(event_type, data_object)
        mark_stripe_webhook_processed(event_id)
    except Exception:
        release_stripe_webhook_claim(event_id)
        raise
