"""Routes Stripe — checkout Pro, add-on usage à la demande et webhooks."""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.billing import stripe_service
from app.core.auth_deps import optional_firebase_user, require_firebase_user
from app.core.config import settings
from app.core.firebase import FirebaseUser, load_user_billing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutResponse(BaseModel):
    url: str


class BillingConfigResponse(BaseModel):
    enabled: bool
    onDemandAvailable: bool
    billingManaged: bool
    proPriceLabel: str = "$30 / month"


class BillingStatusResponse(BaseModel):
    subscriptionPlan: str
    onDemandUsageEnabled: bool
    billingManaged: bool
    stripeSubscriptionStatus: Optional[str] = None


def _require_stripe() -> None:
    if not settings.stripe_enabled:
        raise HTTPException(503, "Stripe billing is not configured.")


@router.get("/config", response_model=BillingConfigResponse)
def billing_config(user: Optional[FirebaseUser] = Depends(optional_firebase_user)):
    import os

    from app.core.firebase import _ensure_app, _db

    billing_managed = False
    if user is not None:
        _ensure_app()
        if _db is not None:
            snap = _db.collection("users").document(user.uid).get()
            if snap.exists:
                profile = snap.to_dict() or {}
                billing_managed = bool(profile.get("billingManaged"))

    return BillingConfigResponse(
        enabled=settings.stripe_checkout_enabled,
        onDemandAvailable=bool(settings.stripe_on_demand_price_id.strip()),
        billingManaged=billing_managed,
        proPriceLabel=os.getenv("STRIPE_PRO_PRICE_LABEL", "$30 / month"),
    )


@router.get("/status", response_model=BillingStatusResponse)
def billing_status(user: FirebaseUser = Depends(require_firebase_user)):
    from app.core.firebase import _ensure_app, _db

    _ensure_app()
    profile: dict = {}
    if _db is not None:
        snap = _db.collection("users").document(user.uid).get()
        if snap.exists:
            profile = snap.to_dict() or {}

    billing = load_user_billing(user.uid)
    plan = profile.get("subscriptionPlan")
    on_demand = profile.get("onDemandUsageEnabled")
    return BillingStatusResponse(
        subscriptionPlan="pro" if plan == "pro" else "free",
        onDemandUsageEnabled=bool(on_demand),
        billingManaged=bool(profile.get("billingManaged")),
        stripeSubscriptionStatus=str(billing.get("stripeSubscriptionStatus") or "") or None,
    )


@router.post("/checkout/pro", response_model=CheckoutResponse)
def checkout_pro(user: FirebaseUser = Depends(require_firebase_user)):
    _require_stripe()
    try:
        url = stripe_service.create_pro_checkout_session(user.uid, user.email)
    except Exception as exc:
        logger.exception("Pro checkout failed for %s", user.uid)
        raise HTTPException(502, "Unable to create Stripe checkout session.") from exc
    return CheckoutResponse(url=url)


@router.post("/on-demand/enable")
def enable_on_demand(user: FirebaseUser = Depends(require_firebase_user)):
    _require_stripe()
    if not settings.stripe_on_demand_price_id.strip():
        raise HTTPException(503, "On-demand add-on is not configured.")
    try:
        stripe_service.enable_on_demand(user.uid)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("On-demand enable failed for %s", user.uid)
        raise HTTPException(502, "Unable to enable on-demand usage.") from exc
    return {"ok": True}


@router.post("/on-demand/disable")
def disable_on_demand(user: FirebaseUser = Depends(require_firebase_user)):
    _require_stripe()
    try:
        stripe_service.disable_on_demand(user.uid)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("On-demand disable failed for %s", user.uid)
        raise HTTPException(502, "Unable to disable on-demand usage.") from exc
    return {"ok": True}


@router.post("/portal", response_model=CheckoutResponse)
def customer_portal(user: FirebaseUser = Depends(require_firebase_user)):
    _require_stripe()
    try:
        url = stripe_service.create_portal_session(user.uid)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Customer portal failed for %s", user.uid)
        raise HTTPException(502, "Unable to open billing portal.") from exc
    return CheckoutResponse(url=url)


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not settings.stripe_webhooks_enabled:
        raise HTTPException(503, "Stripe webhook secret is not configured.")

    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    if not signature:
        raise HTTPException(400, "Missing Stripe signature.")

    try:
        stripe_service.verify_and_dispatch_webhook(payload, signature)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Stripe webhook processing failed")
        raise HTTPException(400, "Invalid Stripe webhook payload.") from exc

    return JSONResponse({"received": True})
