"""Suivi consommation IA — quota Pro personnel et pool Entreprise workspace."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal, Optional

from app.ai.usage_pricing import (
    enterprise_usage_allowance_usd,
    normalize_pricing_model,
    on_demand_usage_markup_multiplier,
    pricing_model_label,
    pro_usage_allowance_usd,
    split_retail_charge,
    usage_cost_usd,
    usage_markup_multiplier,
)
from app.core.firebase import (
    get_user_subscription_state,
    get_workspace_enterprise_state,
    is_workspace_member,
    load_user_on_demand_limit,
    load_user_usage,
    load_workspace_usage,
    record_user_usage,
    record_workspace_usage,
    reset_user_usage_period,
    reset_workspace_usage_period,
)

logger = logging.getLogger(__name__)

UsageScope = Literal["pro", "enterprise"]


def on_demand_billed_usd(doc: dict) -> float:
    stored = doc.get("onDemandUsedUsdRetail")
    if isinstance(stored, (int, float)):
        return max(0.0, float(stored))
    used = float(doc.get("usedUsdRetail") or 0.0)
    allowance = float(doc.get("allowanceUsdRetail") or pro_usage_allowance_usd())
    return max(0.0, used - allowance)


class UsageLimitError(Exception):
    """Quota IA épuisé."""

    def __init__(
        self,
        *,
        used_usd: float,
        allowance_usd: float,
        on_demand_available: bool,
        scope: UsageScope = "pro",
        workspace_id: Optional[str] = None,
        on_demand_limit_usd: Optional[float] = None,
        on_demand_used_usd: float = 0.0,
    ) -> None:
        self.used_usd = used_usd
        self.allowance_usd = allowance_usd
        self.on_demand_available = on_demand_available
        self.scope = scope
        self.workspace_id = workspace_id
        self.on_demand_limit_usd = on_demand_limit_usd
        self.on_demand_used_usd = on_demand_used_usd
        super().__init__("AI usage allowance exceeded.")


@dataclass(frozen=True)
class UsageTarget:
    scope: UsageScope
    key: str


@dataclass(frozen=True)
class ModelUsageRow:
    model_key: str
    label: str
    used_usd: float
    input_tokens: int
    output_tokens: int
    retail_input_usd_per_1m: float
    retail_output_usd_per_1m: float


@dataclass(frozen=True)
class UsageSnapshot:
    allowance_usd: float
    used_usd: float
    remaining_usd: float
    input_tokens: int
    output_tokens: int
    period_start: Optional[str]
    period_end: Optional[str]
    on_demand_enabled: bool
    plan: str
    markup_multiplier: float
    on_demand_markup_multiplier: float = 1.65
    scope: UsageScope = "pro"
    workspace_id: Optional[str] = None
    seat_count: Optional[int] = None
    member_count: Optional[int] = None
    usage_by_model: tuple[ModelUsageRow, ...] = ()
    on_demand_limit_usd: Optional[float] = None
    on_demand_used_usd: float = 0.0
    on_demand_remaining_usd: Optional[float] = None

    def to_dict(self) -> dict:
        payload = {
            "allowanceUsd": round(self.allowance_usd, 4),
            "usedUsd": round(self.used_usd, 4),
            "remainingUsd": round(max(0.0, self.remaining_usd), 4),
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "totalTokens": self.input_tokens + self.output_tokens,
            "periodStart": self.period_start,
            "periodEnd": self.period_end,
            "onDemandEnabled": self.on_demand_enabled,
            "plan": self.plan,
            "scope": self.scope,
        }
        if self.scope == "pro" and self.on_demand_enabled:
            payload["onDemandLimitUsd"] = (
                round(self.on_demand_limit_usd, 4)
                if self.on_demand_limit_usd is not None
                else None
            )
            payload["onDemandUsedUsd"] = round(self.on_demand_used_usd, 4)
            payload["onDemandRemainingUsd"] = (
                round(self.on_demand_remaining_usd, 4)
                if self.on_demand_remaining_usd is not None
                else None
            )
            payload["onDemandMarkupMultiplier"] = round(self.on_demand_markup_multiplier, 4)
        if self.workspace_id:
            payload["workspaceId"] = self.workspace_id
        if self.seat_count is not None:
            payload["seatCount"] = self.seat_count
        if self.member_count is not None:
            payload["memberCount"] = self.member_count
        if self.usage_by_model:
            payload["usageByModel"] = [
                {
                    "modelKey": row.model_key,
                    "label": row.label,
                    "usedUsd": round(row.used_usd, 4),
                    "inputTokens": row.input_tokens,
                    "outputTokens": row.output_tokens,
                    "retailInputUsdPer1M": round(row.retail_input_usd_per_1m, 4),
                    "retailOutputUsdPer1M": round(row.retail_output_usd_per_1m, 4),
                }
                for row in self.usage_by_model
            ]
        return payload


def _usage_rows_from_doc(doc: dict) -> tuple[ModelUsageRow, ...]:
    from app.ai.usage_pricing import model_usage_rate

    raw = doc.get("usageByModel") or {}
    if not isinstance(raw, dict):
        return ()
    rows: list[ModelUsageRow] = []
    for model_key, value in sorted(raw.items()):
        if not isinstance(value, dict):
            continue
        rate = model_usage_rate(str(model_key))
        rows.append(
            ModelUsageRow(
                model_key=str(model_key),
                label=pricing_model_label(str(model_key)),
                used_usd=float(value.get("usedUsdRetail") or 0.0),
                input_tokens=int(value.get("inputTokens") or 0),
                output_tokens=int(value.get("outputTokens") or 0),
                retail_input_usd_per_1m=rate.retail_input_usd_per_1m,
                retail_output_usd_per_1m=rate.retail_output_usd_per_1m,
            )
        )
    return tuple(rows)


def usage_quota_applies(uid: str) -> bool:
    plan, billing_managed, _ = get_user_subscription_state(uid)
    return plan == "pro" and billing_managed


def workspace_usage_quota_applies(workspace_id: str) -> bool:
    plan, billing_managed, _, _ = get_workspace_enterprise_state(workspace_id)
    return plan == "enterprise" and billing_managed


def resolve_usage_target(uid: Optional[str], workspace_id: Optional[str] = None) -> Optional[UsageTarget]:
    wid = (workspace_id or "").strip().lower()
    if uid and wid and workspace_usage_quota_applies(wid) and is_workspace_member(uid, wid):
        return UsageTarget("enterprise", wid)
    if uid and usage_quota_applies(uid):
        return UsageTarget("pro", uid)
    return None


def _snapshot_from_user_doc(
    uid: str,
    *,
    plan: str,
    billing_managed: bool,
    on_demand: bool,
) -> UsageSnapshot:
    allowance = pro_usage_allowance_usd() if plan == "pro" and billing_managed else 0.0
    doc = load_user_usage(uid)
    used = float(doc.get("usedUsdRetail") or 0.0)
    input_tokens = int(doc.get("inputTokens") or 0)
    output_tokens = int(doc.get("outputTokens") or 0)
    period_start = doc.get("periodStart")
    period_end = doc.get("periodEnd")
    stored_allowance = doc.get("allowanceUsdRetail")
    if isinstance(stored_allowance, (int, float)):
        allowance = float(stored_allowance)

    on_demand_limit = load_user_on_demand_limit(uid) if on_demand else None
    on_demand_used = on_demand_billed_usd(doc)
    on_demand_remaining = (
        None if on_demand_limit is None else max(0.0, on_demand_limit - on_demand_used)
    )

    return UsageSnapshot(
        allowance_usd=allowance,
        used_usd=used,
        remaining_usd=allowance - used,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        period_start=str(period_start) if period_start else None,
        period_end=str(period_end) if period_end else None,
        on_demand_enabled=bool(on_demand),
        plan=plan,
        markup_multiplier=usage_markup_multiplier(),
        on_demand_markup_multiplier=on_demand_usage_markup_multiplier(),
        scope="pro",
        usage_by_model=_usage_rows_from_doc(doc),
        on_demand_limit_usd=on_demand_limit,
        on_demand_used_usd=on_demand_used,
        on_demand_remaining_usd=on_demand_remaining,
    )


def _snapshot_from_workspace_doc(workspace_id: str) -> UsageSnapshot:
    wid = workspace_id.strip().lower()
    plan, billing_managed, member_count, seat_count = get_workspace_enterprise_state(wid)
    allowance = (
        enterprise_usage_allowance_usd(seat_count)
        if plan == "enterprise" and billing_managed
        else 0.0
    )
    doc = load_workspace_usage(wid)
    used = float(doc.get("usedUsdRetail") or 0.0)
    input_tokens = int(doc.get("inputTokens") or 0)
    output_tokens = int(doc.get("outputTokens") or 0)
    period_start = doc.get("periodStart")
    period_end = doc.get("periodEnd")
    stored_allowance = doc.get("allowanceUsdRetail")
    if isinstance(stored_allowance, (int, float)):
        allowance = float(stored_allowance)

    return UsageSnapshot(
        allowance_usd=allowance,
        used_usd=used,
        remaining_usd=allowance - used,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        period_start=str(period_start) if period_start else None,
        period_end=str(period_end) if period_end else None,
        on_demand_enabled=False,
        plan=plan if billing_managed else "free",
        markup_multiplier=usage_markup_multiplier(),
        scope="enterprise",
        workspace_id=wid,
        seat_count=seat_count,
        member_count=member_count,
        usage_by_model=_usage_rows_from_doc(doc),
    )


def get_usage_snapshot(uid: str) -> UsageSnapshot:
    plan, billing_managed, on_demand = get_user_subscription_state(uid)
    return _snapshot_from_user_doc(
        uid,
        plan=plan,
        billing_managed=billing_managed,
        on_demand=on_demand,
    )


def get_workspace_usage_snapshot(workspace_id: str) -> UsageSnapshot:
    return _snapshot_from_workspace_doc(workspace_id.strip().lower())


def ensure_usage_allowed(
    target: UsageTarget,
    *,
    estimated_usd: float = 0.0,
    uid: Optional[str] = None,
) -> UsageSnapshot:
    if target.scope == "enterprise":
        if uid and not is_workspace_member(uid, target.key):
            raise UsageLimitError(
                used_usd=0.0,
                allowance_usd=0.0,
                on_demand_available=False,
                scope="enterprise",
                workspace_id=target.key,
            )
        snap = _snapshot_from_workspace_doc(target.key)
        projected = snap.used_usd + max(0.0, estimated_usd)
        if projected <= snap.allowance_usd + 1e-9:
            return snap
        raise UsageLimitError(
            used_usd=snap.used_usd,
            allowance_usd=snap.allowance_usd,
            on_demand_available=False,
            scope="enterprise",
            workspace_id=target.key,
        )

    plan, billing_managed, on_demand = get_user_subscription_state(target.key)
    if plan != "pro" or not billing_managed:
        raise UsageLimitError(used_usd=0.0, allowance_usd=0.0, on_demand_available=False)

    snap = _snapshot_from_user_doc(
        target.key,
        plan=plan,
        billing_managed=billing_managed,
        on_demand=on_demand,
    )
    doc = load_user_usage(target.key)
    allowance = snap.allowance_usd
    current_included = float(doc.get("usedUsdRetail") or 0.0)
    current_on_demand = on_demand_billed_usd(doc)

    provider_estimate = 0.0
    if estimated_usd > 0:
        if current_included + 1e-9 >= allowance:
            provider_estimate = estimated_usd / on_demand_usage_markup_multiplier()
        else:
            provider_estimate = estimated_usd / usage_markup_multiplier()

    inc_delta, od_delta = split_retail_charge(
        provider_estimate,
        current_included_usd=current_included,
        allowance_usd=allowance,
        on_demand_enabled=on_demand,
    )
    projected_included = current_included + inc_delta
    projected_on_demand = current_on_demand + od_delta

    if projected_included <= allowance + 1e-9:
        if projected_on_demand <= 1e-9:
            return snap
        if not on_demand:
            raise UsageLimitError(
                used_usd=snap.used_usd,
                allowance_usd=snap.allowance_usd,
                on_demand_available=True,
                scope="pro",
            )
    elif not on_demand:
        raise UsageLimitError(
            used_usd=snap.used_usd,
            allowance_usd=snap.allowance_usd,
            on_demand_available=True,
            scope="pro",
        )

    limit = load_user_on_demand_limit(target.key)
    if limit is not None and projected_on_demand > limit + 1e-9:
        raise UsageLimitError(
            used_usd=snap.used_usd,
            allowance_usd=snap.allowance_usd,
            on_demand_available=True,
            scope="pro",
            on_demand_limit_usd=limit,
            on_demand_used_usd=current_on_demand,
        )
    return snap


def record_llm_usage(
    target: UsageTarget,
    model_id: str,
    input_tokens: int,
    output_tokens: int,
    *,
    uid: Optional[str] = None,
) -> UsageSnapshot:
    provider_cost = usage_cost_usd(model_id, input_tokens, output_tokens, retail=False)
    if provider_cost <= 0 and input_tokens <= 0 and output_tokens <= 0:
        if target.scope == "enterprise":
            return get_workspace_usage_snapshot(target.key)
        return get_usage_snapshot(target.key)

    if target.scope == "enterprise":
        retail_cost = usage_cost_usd(model_id, input_tokens, output_tokens, retail=True)
        model_key = normalize_pricing_model(model_id)
        delta = {
            "usedUsdRetail": retail_cost,
            "usedUsdProvider": provider_cost,
            "inputTokens": max(0, int(input_tokens)),
            "outputTokens": max(0, int(output_tokens)),
            "modelKey": model_key,
            "lastModel": model_id,
            "lastUsedAt": datetime.now(timezone.utc).isoformat(),
        }
        try:
            if uid:
                delta["lastUid"] = uid
            record_workspace_usage(target.key, delta)
        except Exception as exc:
            logger.warning("Failed to record AI usage for %s: %s", target, exc)
        return get_workspace_usage_snapshot(target.key)

    plan, billing_managed, on_demand = get_user_subscription_state(target.key)
    doc = load_user_usage(target.key)
    allowance = float(doc.get("allowanceUsdRetail") or pro_usage_allowance_usd())
    current_included = float(doc.get("usedUsdRetail") or 0.0)
    included_retail, on_demand_retail = split_retail_charge(
        provider_cost,
        current_included_usd=current_included,
        allowance_usd=allowance,
        on_demand_enabled=on_demand,
    )

    model_key = normalize_pricing_model(model_id)
    delta = {
        "usedUsdRetail": included_retail,
        "onDemandUsedUsdRetail": on_demand_retail,
        "usedUsdProvider": provider_cost,
        "inputTokens": max(0, int(input_tokens)),
        "outputTokens": max(0, int(output_tokens)),
        "modelKey": model_key,
        "lastModel": model_id,
        "lastUsedAt": datetime.now(timezone.utc).isoformat(),
    }
    try:
        record_user_usage(target.key, delta)
    except Exception as exc:
        logger.warning("Failed to record AI usage for %s: %s", target, exc)

    if plan == "pro" and billing_managed and on_demand:
        snap = get_usage_snapshot(target.key)
        try:
            from app.billing.stripe_service import report_on_demand_stripe_usage

            report_on_demand_stripe_usage(target.key, snap.on_demand_used_usd)
        except Exception as exc:
            logger.warning("Failed to report on-demand Stripe usage for %s: %s", target.key, exc)
        return snap

    return get_usage_snapshot(target.key)


def check_usage_gate(uid: Optional[str], workspace_id: Optional[str] = None) -> Optional[str]:
    target = resolve_usage_target(uid, workspace_id)
    if not target:
        return None
    try:
        ensure_usage_allowed(target, uid=uid)
    except UsageLimitError as err:
        return usage_limit_message(err)
    return None


def track_llm_result(
    uid: Optional[str],
    model_id: str,
    result: object,
    workspace_id: Optional[str] = None,
) -> None:
    target = resolve_usage_target(uid, workspace_id)
    if not target:
        return
    billing_model = getattr(result, "model_id", None) or model_id
    input_tokens = int(getattr(result, "input_tokens", 0) or 0)
    output_tokens = int(getattr(result, "output_tokens", 0) or 0)
    if input_tokens <= 0 and output_tokens <= 0:
        return
    record_llm_usage(target, str(billing_model), input_tokens, output_tokens, uid=uid)


def usage_limit_message(err: UsageLimitError) -> str:
    used = f"{err.used_usd:.2f}"
    allowance = f"{err.allowance_usd:.2f}"
    if err.scope == "enterprise":
        return (
            f"Le quota IA Entreprise de ce workspace est épuisé ({used} $ / {allowance} $ "
            "au tarif Lyte, partagé entre tous les membres). "
            "Contactez le propriétaire du workspace pour augmenter les sièges ou attendre le renouvellement."
        )
    if err.on_demand_available:
        if err.on_demand_limit_usd is not None:
            used_od = f"{err.on_demand_used_usd:.2f}"
            limit_od = f"{err.on_demand_limit_usd:.2f}"
            return (
                f"Votre plafond d'usage à la demande est atteint ({used_od} $ / {limit_od} $ "
                "au-delà du forfait Pro). Augmentez la limite dans Paramètres → Plan & Usage."
            )
        return (
            f"Votre quota IA Pro est épuisé ({used} $ / {allowance} $ au tarif Lyte). "
            "Activez l'**usage à la demande** dans Paramètres → Plan & Usage pour continuer."
        )
    return (
        f"Votre quota IA Pro est épuisé ({used} $ / {allowance} $ au tarif Lyte). "
        "Renouvellement au prochain cycle de facturation."
    )


def init_usage_period_for_pro(
    uid: str,
    *,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    stripe_period_start: Optional[int] = None,
) -> None:
    reset_user_usage_period(
        uid,
        allowance_usd=pro_usage_allowance_usd(),
        period_start=period_start,
        period_end=period_end,
        stripe_period_start=stripe_period_start,
    )


def init_usage_period_for_workspace(
    workspace_id: str,
    *,
    seat_count: int,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    stripe_period_start: Optional[int] = None,
) -> None:
    reset_workspace_usage_period(
        workspace_id,
        allowance_usd=enterprise_usage_allowance_usd(seat_count),
        seat_count=seat_count,
        period_start=period_start,
        period_end=period_end,
        stripe_period_start=stripe_period_start,
    )


def maybe_sync_usage_period(uid: str, subscription: dict) -> None:
    period_start_ts = subscription.get("current_period_start")
    if not period_start_ts:
        return
    stripe_start = int(period_start_ts)
    doc = load_user_usage(uid)
    if doc.get("stripePeriodStart") == stripe_start:
        return

    period_end_ts = subscription.get("current_period_end")
    period_start_iso = datetime.fromtimestamp(stripe_start, tz=timezone.utc).isoformat()
    period_end_iso = (
        datetime.fromtimestamp(int(period_end_ts), tz=timezone.utc).isoformat()
        if period_end_ts
        else None
    )
    init_usage_period_for_pro(
        uid,
        period_start=period_start_iso,
        period_end=period_end_iso,
        stripe_period_start=stripe_start,
    )


def maybe_sync_workspace_usage_period(workspace_id: str, subscription: dict, seat_count: int) -> None:
    period_start_ts = subscription.get("current_period_start")
    if not period_start_ts:
        return
    stripe_start = int(period_start_ts)
    wid = workspace_id.strip().lower()
    doc = load_workspace_usage(wid)
    seats = max(int(seat_count or 0), 1)
    new_allowance = enterprise_usage_allowance_usd(seats)

    if doc.get("stripePeriodStart") == stripe_start:
        if doc.get("allowanceUsdRetail") != new_allowance or doc.get("seatCount") != seats:
            from app.core.firebase import _workspace_usage_ref

            ref = _workspace_usage_ref(wid)
            if ref is not None:
                ref.set(
                    {"allowanceUsdRetail": new_allowance, "seatCount": seats},
                    merge=True,
                )
        return

    period_end_ts = subscription.get("current_period_end")
    period_start_iso = datetime.fromtimestamp(stripe_start, tz=timezone.utc).isoformat()
    period_end_iso = (
        datetime.fromtimestamp(int(period_end_ts), tz=timezone.utc).isoformat()
        if period_end_ts
        else None
    )
    init_usage_period_for_workspace(
        wid,
        seat_count=seats,
        period_start=period_start_iso,
        period_end=period_end_iso,
        stripe_period_start=stripe_start,
    )
