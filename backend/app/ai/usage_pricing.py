"""Tarification IA — coût fournisseur vs prix retail (marge), input/output séparés."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

# Coût fournisseur USD / 1M tokens (sources officielles, juin 2026).
# OpenAI: https://openai.com/api/pricing/
# xAI: https://docs.x.ai/developers/pricing
# Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
_DEFAULT_PROVIDER_USD_PER_1M: Dict[str, Tuple[float, float]] = {
    # (input, output)
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-4o-mini": (0.15, 0.60),
    # grok-3-mini / grok-4.1 → alias xAI vers grok-4.3 (facturé au même tarif)
    "grok-3-mini": (1.25, 2.50),
    "grok-4.1": (1.25, 2.50),
    "grok-4.3": (1.25, 2.50),
    # grok-4.20-0309-reasoning (pipeline CAO)
    "grok-cad-reasoning": (1.25, 2.50),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
}

# Alias API / UI → clé tarifaire canonique.
_MODEL_PRICING_ALIASES: Dict[str, str] = {
    "auto": "gpt-4o-mini",
    "grok-mini": "grok-3-mini",
    "grok-3-mini": "grok-3-mini",
    "grok": "grok-4.1",
    "grok-4.1": "grok-4.1",
    "grok-4.3": "grok-4.3",
    "grok-4.20": "grok-cad-reasoning",
    "grok-4.20-reasoning": "grok-cad-reasoning",
    "grok-4.20-0309-reasoning": "grok-cad-reasoning",
    "grok-build-0.1": "grok-cad-reasoning",
    "gpt-4-1-nano": "gpt-4.1-nano",
    "gpt-4.1-nano": "gpt-4.1-nano",
    "gpt-4o": "gpt-4o-mini",
    "gpt-4o-mini": "gpt-4o-mini",
    "claude-opus-4-20250514": "claude-opus-4-7",
    "claude-opus-4-7": "claude-opus-4-7",
    "claude-opus-4-8": "claude-opus-4-8",
    "opus-4.7": "claude-opus-4-7",
    "opus-4.8": "claude-opus-4-8",
}


def usage_markup_multiplier() -> float:
    raw = os.getenv("FORMA_USAGE_MARKUP", "1.25").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 1.25
    return max(value, 1.0)


def on_demand_usage_markup_multiplier() -> float:
    """Marge retail au-delà du forfait Pro (usage à la demande)."""
    raw = os.getenv("FORMA_ON_DEMAND_USAGE_MARKUP", "1.65").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 1.65
    return max(value, 1.0)


def pro_usage_allowance_usd() -> float:
    raw = os.getenv("FORMA_PRO_USAGE_ALLOWANCE_USD", "30").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 30.0
    return max(value, 0.0)


def enterprise_usage_allowance_per_seat_usd() -> float:
    raw = os.getenv("FORMA_ENTERPRISE_USAGE_ALLOWANCE_USD_PER_SEAT", "25").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 25.0
    return max(value, 0.0)


def enterprise_usage_allowance_usd(seat_count: int) -> float:
    seats = max(int(seat_count or 0), 1)
    return enterprise_usage_allowance_per_seat_usd() * seats


def _parse_rate_entry(value: object) -> Tuple[float, float] | None:
    if isinstance(value, (int, float)):
        blended_per_10k = float(value)
        per_1m = blended_per_10k * 100.0
        return per_1m, per_1m
    if isinstance(value, dict):
        inp = value.get("inputUsdPer1M", value.get("input"))
        out = value.get("outputUsdPer1M", value.get("output"))
        if inp is None or out is None:
            return None
        return float(inp), float(out)
    return None


def _provider_table() -> Dict[str, Tuple[float, float]]:
    raw = os.getenv("FORMA_MODEL_PROVIDER_RATES", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                table: Dict[str, Tuple[float, float]] = {}
                for key, value in parsed.items():
                    rates = _parse_rate_entry(value)
                    if rates:
                        table[str(key).strip().lower()] = rates
                if table:
                    return table
        except (json.JSONDecodeError, TypeError, ValueError):
            logger.warning("Invalid FORMA_MODEL_PROVIDER_RATES JSON")

    legacy = os.getenv("FORMA_MODEL_PROVIDER_USD_PER_10K", "").strip()
    if legacy:
        try:
            parsed = json.loads(legacy)
            if isinstance(parsed, dict):
                table = {}
                for key, value in parsed.items():
                    rates = _parse_rate_entry(value)
                    if rates:
                        table[str(key).strip().lower()] = rates
                if table:
                    logger.warning(
                        "FORMA_MODEL_PROVIDER_USD_PER_10K is deprecated; "
                        "use FORMA_MODEL_PROVIDER_RATES with input/output per 1M tokens."
                    )
                    return table
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    return dict(_DEFAULT_PROVIDER_USD_PER_1M)


def normalize_pricing_model(model_id: str) -> str:
    mid = (model_id or "").strip().lower()
    if not mid:
        return "gpt-4o-mini"
    if mid in _MODEL_PRICING_ALIASES:
        return _MODEL_PRICING_ALIASES[mid]
    for alias, key in _MODEL_PRICING_ALIASES.items():
        if alias in mid or mid in alias:
            if len(alias) >= 4:
                return key
    if "nano" in mid and "gpt" in mid:
        return "gpt-4.1-nano"
    if "gpt-4o-mini" in mid or mid.startswith("gpt-4o"):
        return "gpt-4o-mini"
    if "grok-3-mini" in mid or mid == "grok-mini":
        return "grok-3-mini"
    if "build" in mid or "4.20" in mid or "reasoning" in mid:
        return "grok-cad-reasoning"
    if "4.1" in mid and "grok" in mid:
        return "grok-4.1"
    if "grok" in mid:
        return "grok-4.3"
    if "opus" in mid and ("4-8" in mid or "48" in mid):
        return "claude-opus-4-8"
    if "claude" in mid or "opus" in mid:
        return "claude-opus-4-7"
    return mid


def pricing_model_label(model_key: str) -> str:
    labels = {
        "gpt-4.1-nano": "GPT 4.1 nano",
        "gpt-4o-mini": "GPT 4o mini",
        "grok-3-mini": "Grok 3 Mini",
        "grok-4.1": "Grok 4.1",
        "grok-4.3": "Grok 4.3",
        "grok-cad-reasoning": "Grok reasoning (CAO)",
        "claude-opus-4-7": "Claude Opus 4.7",
        "claude-opus-4-8": "Claude Opus 4.8",
    }
    return labels.get(model_key, model_key)


@dataclass(frozen=True)
class ModelUsageRate:
    model_key: str
    provider_input_usd_per_1m: float
    provider_output_usd_per_1m: float
    retail_input_usd_per_1m: float
    retail_output_usd_per_1m: float


def model_usage_rate(model_id: str) -> ModelUsageRate:
    key = normalize_pricing_model(model_id)
    inp, out = _provider_table().get(key, (1.0, 1.0))
    markup = usage_markup_multiplier()
    return ModelUsageRate(
        model_key=key,
        provider_input_usd_per_1m=inp,
        provider_output_usd_per_1m=out,
        retail_input_usd_per_1m=inp * markup,
        retail_output_usd_per_1m=out * markup,
    )


def usage_cost_usd(
    model_id: str,
    input_tokens: int,
    output_tokens: int,
    *,
    retail: bool = True,
    markup_multiplier: float | None = None,
) -> float:
    inp = max(0, int(input_tokens))
    out = max(0, int(output_tokens))
    if inp <= 0 and out <= 0:
        return 0.0
    rate = model_usage_rate(model_id)
    if retail:
        multiplier = (
            float(markup_multiplier)
            if markup_multiplier is not None
            else usage_markup_multiplier()
        )
    else:
        multiplier = 1.0
    provider_cost = (inp / 1_000_000.0) * rate.provider_input_usd_per_1m
    provider_cost += (out / 1_000_000.0) * rate.provider_output_usd_per_1m
    return provider_cost * multiplier


def split_retail_charge(
    provider_cost: float,
    *,
    current_included_usd: float,
    allowance_usd: float,
    on_demand_enabled: bool,
) -> tuple[float, float]:
    """Répartit le coût fournisseur entre forfait (× marge incluse) et on-demand (×1.65)."""
    if provider_cost <= 0:
        return 0.0, 0.0
    included_markup = usage_markup_multiplier()
    on_demand_markup = on_demand_usage_markup_multiplier()
    remaining = max(0.0, float(allowance_usd) - float(current_included_usd))
    full_at_included = provider_cost * included_markup
    if full_at_included <= remaining + 1e-9:
        return full_at_included, 0.0
    if not on_demand_enabled:
        return min(full_at_included, remaining), 0.0
    if remaining <= 1e-9:
        return 0.0, provider_cost * on_demand_markup
    included_retail = remaining
    included_provider = included_retail / included_markup
    on_demand_provider = max(0.0, provider_cost - included_provider)
    on_demand_retail = on_demand_provider * on_demand_markup
    return included_retail, on_demand_retail


def list_public_model_rates() -> list[dict[str, float | str]]:
    markup = usage_markup_multiplier()
    on_demand_markup = on_demand_usage_markup_multiplier()
    rows: list[dict[str, float | str]] = []
    for key, (provider_in, provider_out) in sorted(_provider_table().items()):
        rows.append(
            {
                "modelKey": key,
                "label": pricing_model_label(key),
                "providerInputUsdPer1M": round(provider_in, 4),
                "providerOutputUsdPer1M": round(provider_out, 4),
                "retailInputUsdPer1M": round(provider_in * markup, 4),
                "retailOutputUsdPer1M": round(provider_out * markup, 4),
                "onDemandInputUsdPer1M": round(provider_in * on_demand_markup, 4),
                "onDemandOutputUsdPer1M": round(provider_out * on_demand_markup, 4),
            }
        )
    return rows
