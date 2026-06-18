const DEFAULT_PROVIDER_USD_PER_1M: Record<string, [number, number]> = {
  "gpt-4.1-nano": [0.1, 0.4],
  "gpt-4o-mini": [0.15, 0.6],
  "grok-3-mini": [1.25, 2.5],
  "grok-4.1": [1.25, 2.5],
  "grok-4.3": [1.25, 2.5],
  "grok-cad-reasoning": [1.25, 2.5],
  "claude-opus-4-7": [5.0, 25.0],
  "claude-opus-4-8": [5.0, 25.0],
};

const MODEL_PRICING_ALIASES: Record<string, string> = {
  auto: "gpt-4o-mini",
  "grok-mini": "grok-3-mini",
  "grok-3-mini": "grok-3-mini",
  grok: "grok-4.1",
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
};

export interface ModelUsageRate {
  modelKey: string;
  providerInputUsdPer1M: number;
  providerOutputUsdPer1M: number;
  retailInputUsdPer1M: number;
  retailOutputUsdPer1M: number;
}

export function usageMarkupMultiplier(): number {
  const raw = process.env.FORMA_USAGE_MARKUP ?? "1.25";
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(value, 1) : 1.25;
}

export function onDemandUsageMarkupMultiplier(): number {
  const raw = process.env.FORMA_ON_DEMAND_USAGE_MARKUP ?? "1.65";
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(value, 1) : 1.65;
}

export function proUsageAllowanceUsd(): number {
  const raw = process.env.FORMA_PRO_USAGE_ALLOWANCE_USD ?? "30";
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(value, 0) : 30;
}

export function enterpriseUsageAllowancePerSeatUsd(): number {
  const raw = process.env.FORMA_ENTERPRISE_USAGE_ALLOWANCE_USD_PER_SEAT ?? "25";
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(value, 0) : 25;
}

export function enterpriseUsageAllowanceUsd(seatCount: number): number {
  const seats = Math.max(Number(seatCount) || 0, 1);
  return enterpriseUsageAllowancePerSeatUsd() * seats;
}

function parseRateEntry(value: unknown): [number, number] | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const per1M = value * 100;
    return [per1M, per1M];
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const inp = obj.inputUsdPer1M ?? obj.input;
    const out = obj.outputUsdPer1M ?? obj.output;
    const inNum = Number(inp);
    const outNum = Number(out);
    if (Number.isFinite(inNum) && Number.isFinite(outNum)) return [inNum, outNum];
  }
  return null;
}

function providerTable(): Record<string, [number, number]> {
  const raw = (process.env.FORMA_MODEL_PROVIDER_RATES ?? "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, [number, number]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const rates = parseRateEntry(value);
        if (rates) out[key.trim().toLowerCase()] = rates;
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      /* ignore */
    }
  }

  const legacy = (process.env.FORMA_MODEL_PROVIDER_USD_PER_10K ?? "").trim();
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as Record<string, unknown>;
      const out: Record<string, [number, number]> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const rates = parseRateEntry(value);
        if (rates) out[key.trim().toLowerCase()] = rates;
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      /* ignore */
    }
  }

  return { ...DEFAULT_PROVIDER_USD_PER_1M };
}

export function normalizePricingModel(modelId: string): string {
  const mid = (modelId || "").trim().toLowerCase();
  if (!mid) return "gpt-4o-mini";
  if (MODEL_PRICING_ALIASES[mid]) return MODEL_PRICING_ALIASES[mid];
  if (mid.includes("nano") && mid.includes("gpt")) return "gpt-4.1-nano";
  if (mid.includes("gpt-4o-mini") || mid.startsWith("gpt-4o")) return "gpt-4o-mini";
  if (mid.includes("grok-3-mini") || mid === "grok-mini") return "grok-3-mini";
  if (mid.includes("build") || mid.includes("4.20") || mid.includes("reasoning")) {
    return "grok-cad-reasoning";
  }
  if (mid.includes("4.1") && mid.includes("grok")) return "grok-4.1";
  if (mid.includes("grok")) return "grok-4.3";
  if (mid.includes("opus") && (mid.includes("4-8") || mid.includes("48"))) return "claude-opus-4-8";
  if (mid.includes("claude") || mid.includes("opus")) return "claude-opus-4-7";
  return mid;
}

export function modelUsageRate(modelId: string): ModelUsageRate {
  const key = normalizePricingModel(modelId);
  const [inp, out] = providerTable()[key] ?? [1, 1];
  const markup = usageMarkupMultiplier();
  return {
    modelKey: key,
    providerInputUsdPer1M: inp,
    providerOutputUsdPer1M: out,
    retailInputUsdPer1M: inp * markup,
    retailOutputUsdPer1M: out * markup,
  };
}

export function usageCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  retail = true,
  markupMultiplier?: number,
): number {
  const inp = Math.max(0, inputTokens);
  const out = Math.max(0, outputTokens);
  if (inp <= 0 && out <= 0) return 0;
  const rate = modelUsageRate(modelId);
  const multiplier = retail
    ? markupMultiplier ?? usageMarkupMultiplier()
    : 1;
  const providerCost =
    (inp / 1_000_000) * rate.providerInputUsdPer1M +
    (out / 1_000_000) * rate.providerOutputUsdPer1M;
  return providerCost * multiplier;
}

export function splitRetailCharge(
  providerCost: number,
  currentIncludedUsd: number,
  allowanceUsd: number,
  onDemandEnabled: boolean,
): [number, number] {
  if (providerCost <= 0) return [0, 0];
  const includedMarkup = usageMarkupMultiplier();
  const onDemandMarkup = onDemandUsageMarkupMultiplier();
  const remaining = Math.max(0, allowanceUsd - currentIncludedUsd);
  const fullAtIncluded = providerCost * includedMarkup;
  if (fullAtIncluded <= remaining + 1e-9) return [fullAtIncluded, 0];
  if (!onDemandEnabled) return [Math.min(fullAtIncluded, remaining), 0];
  if (remaining <= 1e-9) return [0, providerCost * onDemandMarkup];
  const includedRetail = remaining;
  const includedProvider = includedRetail / includedMarkup;
  const onDemandProvider = Math.max(0, providerCost - includedProvider);
  return [includedRetail, onDemandProvider * onDemandMarkup];
}
