"""Routes Stripe — checkout Pro, add-on usage à la demande et webhooks."""
from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.billing import stripe_service
from app.billing.checkout_timing import timing_enabled
from app.core.auth_deps import optional_firebase_user, require_firebase_user
from app.core.config import settings
from app.core.firebase import FirebaseUser, load_user_billing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutResponse(BaseModel):
    url: str


class CheckoutEnterpriseRequest(BaseModel):
    workspaceId: str


class BillingConfigResponse(BaseModel):
    enabled: bool
    onDemandAvailable: bool
    billingManaged: bool
    proPriceLabel: str = "$30 / month"
    enterpriseEnabled: bool = False
    enterpriseMinMembers: int = 10
    enterpriseSeatPriceLabel: str = "$18 / seat / month"


class EnterpriseWorkspaceItem(BaseModel):
    workspaceId: str
    name: str
    memberCount: int
    minMembers: int
    eligible: bool
    enterpriseActive: bool


class EnterpriseWorkspacesResponse(BaseModel):
    workspaces: list[EnterpriseWorkspaceItem]


class BillingStatusResponse(BaseModel):
    subscriptionPlan: str
    onDemandUsageEnabled: bool
    onDemandLimitUsd: Optional[float] = None
    billingManaged: bool
    stripeSubscriptionStatus: Optional[str] = None


class OnDemandLimitRequest(BaseModel):
    limitUsd: Optional[float] = None


class OnDemandEnableRequest(BaseModel):
    limitUsd: Optional[float] = 25.0


class ModelRateItem(BaseModel):
    modelKey: str
    label: str = ""
    providerInputUsdPer1M: float
    providerOutputUsdPer1M: float
    retailInputUsdPer1M: float
    retailOutputUsdPer1M: float
    onDemandInputUsdPer1M: float
    onDemandOutputUsdPer1M: float


class UsageByModelItem(BaseModel):
    modelKey: str
    label: str
    usedUsd: float
    inputTokens: int
    outputTokens: int
    retailInputUsdPer1M: float
    retailOutputUsdPer1M: float


class UsageResponse(BaseModel):
    allowanceUsd: float
    usedUsd: float
    remainingUsd: float
    inputTokens: int
    outputTokens: int
    totalTokens: int
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
    onDemandEnabled: bool
    onDemandLimitUsd: Optional[float] = None
    onDemandUsedUsd: Optional[float] = None
    onDemandRemainingUsd: Optional[float] = None
    markupMultiplier: float
    onDemandMarkupMultiplier: Optional[float] = None
    plan: str
    scope: str = "pro"
    workspaceId: Optional[str] = None
    seatCount: Optional[int] = None
    memberCount: Optional[int] = None
    usageByModel: list[UsageByModelItem] = []
    modelRates: list[ModelRateItem] = []


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
        enterpriseEnabled=settings.stripe_enterprise_enabled,
        enterpriseMinMembers=settings.stripe_enterprise_min_members,
        enterpriseSeatPriceLabel=os.getenv(
            "STRIPE_ENTERPRISE_SEAT_PRICE_LABEL",
            "$18 / seat / month",
        ),
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
    raw_plan = profile.get("subscriptionPlan")
    billing_managed = bool(profile.get("billingManaged"))
    plan = "pro" if raw_plan == "pro" and billing_managed else "free"
    on_demand = profile.get("onDemandUsageEnabled")
    raw_limit = profile.get("onDemandLimitUsd")
    on_demand_limit = (
        float(raw_limit)
        if plan == "pro" and billing_managed and isinstance(raw_limit, (int, float))
        else None
    )
    return BillingStatusResponse(
        subscriptionPlan=plan,
        onDemandUsageEnabled=bool(on_demand) if plan == "pro" and billing_managed else False,
        onDemandLimitUsd=on_demand_limit if bool(on_demand) else None,
        billingManaged=billing_managed,
        stripeSubscriptionStatus=str(billing.get("stripeSubscriptionStatus") or "") or None,
    )


@router.get("/usage", response_model=UsageResponse)
def billing_usage(user: FirebaseUser = Depends(require_firebase_user)):
    from app.ai.usage import get_usage_snapshot
    from app.ai.usage_pricing import list_public_model_rates, usage_markup_multiplier

    snap = get_usage_snapshot(user.uid)
    data = snap.to_dict()
    usage_by_model = data.pop("usageByModel", [])
    return UsageResponse(
        **data,
        markupMultiplier=snap.markup_multiplier or usage_markup_multiplier(),
        modelRates=[ModelRateItem(**row) for row in list_public_model_rates()],
        usageByModel=[UsageByModelItem(**row) for row in usage_by_model],
    )


@router.get("/enterprise/usage", response_model=UsageResponse)
def billing_enterprise_usage(
    workspaceId: str = Query(..., min_length=2, max_length=128),
    user: FirebaseUser = Depends(require_firebase_user),
):
    from app.ai.usage import get_workspace_usage_snapshot, workspace_usage_quota_applies
    from app.ai.usage_pricing import list_public_model_rates, usage_markup_multiplier
    from app.core.firebase import is_workspace_member

    wid = workspaceId.strip().lower()
    if not is_workspace_member(user.uid, wid):
        raise HTTPException(403, "Accès réservé aux membres du workspace.")
    if not workspace_usage_quota_applies(wid):
        raise HTTPException(404, "Ce workspace n'a pas d'abonnement Entreprise actif.")

    snap = get_workspace_usage_snapshot(wid)
    data = snap.to_dict()
    usage_by_model = data.pop("usageByModel", [])
    return UsageResponse(
        **data,
        markupMultiplier=snap.markup_multiplier or usage_markup_multiplier(),
        modelRates=[ModelRateItem(**row) for row in list_public_model_rates()],
        usageByModel=[UsageByModelItem(**row) for row in usage_by_model],
    )


@router.post("/checkout/pro", response_model=CheckoutResponse)
def checkout_pro(user: FirebaseUser = Depends(require_firebase_user)):
    _require_stripe()
    req_start = time.perf_counter()
    try:
        url = stripe_service.create_pro_checkout_session(user.uid, user.email)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Pro checkout failed for %s", user.uid)
        raise HTTPException(502, "Unable to create Stripe checkout session.") from exc
    if timing_enabled():
        logger.info(
            "checkout/pro http_total=%.0fms uid=%s",
            (time.perf_counter() - req_start) * 1000,
            user.uid,
        )
    return CheckoutResponse(url=url)


@router.get("/enterprise/workspaces", response_model=EnterpriseWorkspacesResponse)
def enterprise_workspaces(user: FirebaseUser = Depends(require_firebase_user)):
    if not settings.stripe_enterprise_enabled:
        raise HTTPException(503, "Enterprise billing is not configured.")
    items = stripe_service.list_enterprise_workspaces_for_owner(user.uid)
    return EnterpriseWorkspacesResponse(
        workspaces=[EnterpriseWorkspaceItem(**item) for item in items],
    )


@router.post("/checkout/enterprise", response_model=CheckoutResponse)
def checkout_enterprise(
    body: CheckoutEnterpriseRequest,
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not settings.stripe_enterprise_enabled:
        raise HTTPException(503, "Enterprise billing is not configured.")
    req_start = time.perf_counter()
    try:
        url = stripe_service.create_enterprise_checkout_session(
            user.uid,
            user.email,
            body.workspaceId,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Enterprise checkout failed for %s", user.uid)
        raise HTTPException(502, "Unable to create enterprise checkout session.") from exc
    if timing_enabled():
        logger.info(
            "checkout/enterprise http_total=%.0fms uid=%s workspace=%s",
            (time.perf_counter() - req_start) * 1000,
            user.uid,
            body.workspaceId.strip().lower(),
        )
    return CheckoutResponse(url=url)


@router.post("/portal/enterprise", response_model=CheckoutResponse)
def enterprise_portal(
    body: CheckoutEnterpriseRequest,
    user: FirebaseUser = Depends(require_firebase_user),
):
    if not settings.stripe_enterprise_enabled:
        raise HTTPException(503, "Enterprise billing is not configured.")
    try:
        url = stripe_service.create_enterprise_portal_session(user.uid, body.workspaceId)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("Enterprise portal failed for %s", user.uid)
        raise HTTPException(502, "Unable to open enterprise billing portal.") from exc
    return CheckoutResponse(url=url)


@router.post("/on-demand/enable")
def enable_on_demand(
    body: OnDemandEnableRequest,
    user: FirebaseUser = Depends(require_firebase_user),
):
    _require_stripe()
    if not settings.stripe_on_demand_price_id.strip():
        raise HTTPException(503, "On-demand add-on is not configured.")
    try:
        stripe_service.enable_on_demand(user.uid, limit_usd=body.limitUsd)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("On-demand enable failed for %s", user.uid)
        raise HTTPException(502, "Unable to enable on-demand usage.") from exc
    return {"ok": True}


@router.post("/on-demand/limit")
def set_on_demand_limit(
    body: OnDemandLimitRequest,
    user: FirebaseUser = Depends(require_firebase_user),
):
    _require_stripe()
    try:
        stripe_service.set_on_demand_limit(user.uid, body.limitUsd)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        logger.exception("On-demand limit update failed for %s", user.uid)
        raise HTTPException(502, "Unable to update on-demand limit.") from exc
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
