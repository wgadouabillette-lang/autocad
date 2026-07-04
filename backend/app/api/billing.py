"""Routes facturation — usage et sync dev (Stripe retiré temporairement)."""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.auth_deps import optional_firebase_user, require_firebase_user
from app.core.firebase import FirebaseUser, load_user_billing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class BillingConfigResponse(BaseModel):
    enabled: bool
    onDemandAvailable: bool
    billingManaged: bool
    proPriceLabel: str = "$30 / month"
    enterpriseEnabled: bool = False
    enterpriseMinMembers: int = 2
    enterpriseSeatPriceLabel: str = "$18 / seat / month"


class EnterpriseWorkspacesResponse(BaseModel):
    workspaces: list = []


class BillingStatusResponse(BaseModel):
    subscriptionPlan: str
    onDemandUsageEnabled: bool
    onDemandLimitUsd: Optional[float] = None
    billingManaged: bool


class DevPlanSyncRequest(BaseModel):
    plan: str
    onDemandUsageEnabled: bool = False


class BillingSummaryResponse(BaseModel):
    currentPlan: str
    planLabel: str
    billingManaged: bool
    workspaceId: Optional[str] = None
    workspaceName: Optional[str] = None
    nextBillingDate: Optional[str] = None
    cancelAtPeriodEnd: bool = False
    transactions: list = []


class UsageByModelItem(BaseModel):
    modelKey: str
    label: str
    usedUsd: float
    inputTokens: int
    outputTokens: int
    retailInputUsdPer1M: float
    retailOutputUsdPer1M: float


class ModelRateItem(BaseModel):
    modelKey: str
    label: str = ""
    providerInputUsdPer1M: float
    providerOutputUsdPer1M: float
    retailInputUsdPer1M: float
    retailOutputUsdPer1M: float
    onDemandInputUsdPer1M: float
    onDemandOutputUsdPer1M: float


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


def _billing_unavailable() -> HTTPException:
    return HTTPException(503, "La facturation en ligne n'est pas disponible pour le moment.")


@router.get("/config", response_model=BillingConfigResponse)
def billing_config(user: Optional[FirebaseUser] = Depends(optional_firebase_user)):
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
        enabled=False,
        onDemandAvailable=False,
        billingManaged=billing_managed,
        proPriceLabel="$30 / month",
        enterpriseEnabled=False,
        enterpriseMinMembers=2,
        enterpriseSeatPriceLabel="$18 / seat / month",
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
    )


@router.post("/dev-plan-sync")
def dev_plan_sync(
    body: DevPlanSyncRequest,
    user: FirebaseUser = Depends(require_firebase_user),
):
    from app.ai.usage import init_usage_period_for_pro
    from app.core.firebase import load_user_usage, update_user_subscription_profile

    plan = "pro" if body.plan == "pro" else "free"
    on_demand = plan == "pro" and bool(body.onDemandUsageEnabled)
    update_user_subscription_profile(
        user.uid,
        subscription_plan=plan,
        on_demand_usage_enabled=on_demand,
        billing_managed=plan == "pro",
    )
    if plan == "pro":
        existing = load_user_usage(user.uid)
        if not isinstance(existing.get("allowanceUsdRetail"), (int, float)):
            init_usage_period_for_pro(user.uid)
    return {"ok": True, "plan": plan}


def _workspace_display_name(workspace_id: str) -> str:
    from app.core.firebase import _ensure_app, _db

    wid = workspace_id.strip().lower()
    _ensure_app()
    if _db is None:
        return wid
    try:
        snap = _db.collection("workspacesShared").document(wid).get()
        if snap.exists:
            name = str((snap.to_dict() or {}).get("name") or "").strip()
            if name:
                return name
    except Exception:
        pass
    return wid


@router.get("/summary", response_model=BillingSummaryResponse)
def billing_summary(
    workspaceId: Optional[str] = Query(None, max_length=128),
    user: FirebaseUser = Depends(require_firebase_user),
):
    from app.ai.usage import get_usage_snapshot, get_workspace_usage_snapshot
    from app.core.firebase import get_user_subscription_state, get_workspace_enterprise_state, is_workspace_member

    wid = workspaceId.strip().lower() if workspaceId else None

    if wid:
        plan, billing_managed, _, _ = get_workspace_enterprise_state(wid)
        if plan == "enterprise" and billing_managed and is_workspace_member(user.uid, wid):
            usage = get_workspace_usage_snapshot(wid)
            return BillingSummaryResponse(
                currentPlan="enterprise",
                planLabel="Entreprise",
                billingManaged=True,
                workspaceId=wid,
                workspaceName=_workspace_display_name(wid),
                nextBillingDate=usage.period_end,
                cancelAtPeriodEnd=False,
                transactions=[],
            )

    plan, billing_managed, _ = get_user_subscription_state(user.uid)
    if plan == "pro" and billing_managed:
        usage = get_usage_snapshot(user.uid)
        return BillingSummaryResponse(
            currentPlan="pro",
            planLabel="Pro",
            billingManaged=True,
            nextBillingDate=usage.period_end,
            cancelAtPeriodEnd=False,
            transactions=[],
        )

    return BillingSummaryResponse(
        currentPlan="free",
        planLabel="Gratuit",
        billingManaged=False,
        transactions=[],
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


@router.get("/enterprise/workspaces", response_model=EnterpriseWorkspacesResponse)
def enterprise_workspaces(user: FirebaseUser = Depends(require_firebase_user)):
    return EnterpriseWorkspacesResponse(workspaces=[])


@router.post("/cancel")
def cancel_billing(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/checkout/pro")
def checkout_pro(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/checkout/enterprise")
def checkout_enterprise(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/portal/enterprise")
def enterprise_portal(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/on-demand/enable")
def enable_on_demand(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/on-demand/limit")
def set_on_demand_limit(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/on-demand/disable")
def disable_on_demand(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/sync", response_model=BillingStatusResponse)
def sync_billing(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()


@router.post("/portal")
def customer_portal(user: FirebaseUser = Depends(require_firebase_user)):
    raise _billing_unavailable()
