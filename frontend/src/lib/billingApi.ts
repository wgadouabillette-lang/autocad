import { getAuthIdToken } from "./firebase/authToken";

const BASE = "/api/billing";

export interface BillingConfig {
  enabled: boolean;
  onDemandAvailable: boolean;
  billingManaged: boolean;
  proPriceLabel: string;
  enterpriseEnabled: boolean;
  enterpriseMinMembers: number;
  enterpriseSeatPriceLabel: string;
}

export interface BillingStatus {
  subscriptionPlan: "free" | "pro";
  onDemandUsageEnabled: boolean;
  onDemandLimitUsd?: number | null;
  billingManaged: boolean;
  stripeSubscriptionStatus: string | null;
}

export interface ModelRateItem {
  modelKey: string;
  label?: string;
  providerInputUsdPer1M: number;
  providerOutputUsdPer1M: number;
  retailInputUsdPer1M: number;
  retailOutputUsdPer1M: number;
  onDemandInputUsdPer1M: number;
  onDemandOutputUsdPer1M: number;
}

export interface UsageByModelItem {
  modelKey: string;
  label: string;
  usedUsd: number;
  inputTokens: number;
  outputTokens: number;
  retailInputUsdPer1M: number;
  retailOutputUsdPer1M: number;
}

export interface UsageStatus {
  allowanceUsd: number;
  usedUsd: number;
  remainingUsd: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  periodStart: string | null;
  periodEnd: string | null;
  onDemandEnabled: boolean;
  onDemandLimitUsd?: number | null;
  onDemandUsedUsd?: number;
  onDemandRemainingUsd?: number | null;
  plan: string;
  scope: string;
  workspaceId?: string | null;
  seatCount?: number | null;
  memberCount?: number | null;
  usageByModel?: UsageByModelItem[];
  markupMultiplier: number;
  onDemandMarkupMultiplier?: number | null;
  modelRates: ModelRateItem[];
}

export interface EnterpriseWorkspaceOption {
  workspaceId: string;
  name: string;
  memberCount: number;
  minMembers: number;
  eligible: boolean;
  enterpriseActive: boolean;
}

export interface BillingTransaction {
  id: string;
  date: string;
  description: string;
  amountLabel: string;
  status: string;
  invoiceUrl?: string | null;
}

export interface BillingSummary {
  currentPlan: "free" | "pro" | "enterprise";
  planLabel: string;
  billingManaged: boolean;
  workspaceId?: string | null;
  workspaceName?: string | null;
  nextBillingDate?: string | null;
  cancelAtPeriodEnd: boolean;
  stripeEnabled: boolean;
  transactions: BillingTransaction[];
}

let cachedAuthToken: string | null = null;
let cachedAuthTokenAt = 0;
const AUTH_TOKEN_TTL_MS = 4 * 60 * 1000;

async function billingAuthToken(forceRefresh = false): Promise<string | null> {
  if (
    !forceRefresh &&
    cachedAuthToken &&
    Date.now() - cachedAuthTokenAt < AUTH_TOKEN_TTL_MS
  ) {
    return cachedAuthToken;
  }
  const token = await getAuthIdToken(forceRefresh);
  if (token) {
    cachedAuthToken = token;
    cachedAuthTokenAt = Date.now();
  }
  return token;
}

async function authHeaders(forceRefresh = false): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await billingAuthToken(forceRefresh);
  if (!token) {
    throw new Error("Connectez-vous à l'app avant de gérer la facturation.");
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readError(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const json = JSON.parse(text) as { detail?: string };
    return json.detail || text || `HTTP ${r.status}`;
  } catch {
    return text || `HTTP ${r.status}`;
  }
}

async function fetchWithAuth(path: string, init: RequestInit, auth = true): Promise<Response> {
  if (!auth) {
    return fetch(`${BASE}${path}`, init);
  }
  let r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...(await authHeaders(false)) },
  });
  if (r.status === 401) {
    r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), ...(await authHeaders(true)) },
    });
  }
  return r;
}

async function jsonGet<T>(path: string, auth = true): Promise<T> {
  const r = await fetchWithAuth(path, {}, auth);
  if (!r.ok) throw new Error(await readError(r));
  return r.json() as Promise<T>;
}

async function jsonPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetchWithAuth(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readError(r));
  return r.json() as Promise<T>;
}

export function warmCheckoutAuth(): void {
  void billingAuthToken(false);
}

export const billingApi = {
  config() {
    return jsonGet<BillingConfig>("/config", false);
  },

  status() {
    return jsonGet<BillingStatus>("/status");
  },

  summary(workspaceId?: string | null) {
    const wid = workspaceId?.trim().toLowerCase();
    const query = wid ? `?workspaceId=${encodeURIComponent(wid)}` : "";
    return jsonGet<BillingSummary>(`/summary${query}`);
  },

  cancelSubscription(workspaceId?: string | null) {
    const wid = workspaceId?.trim().toLowerCase();
    return jsonPost<{ ok: boolean }>("/cancel", wid ? { workspaceId: wid } : {});
  },

  sync() {
    return jsonPost<BillingStatus>("/sync");
  },

  usage() {
    return jsonGet<UsageStatus>("/usage");
  },

  enterpriseUsage(workspaceId: string) {
    const wid = workspaceId.trim().toLowerCase();
    return jsonGet<UsageStatus>(`/enterprise/usage?workspaceId=${encodeURIComponent(wid)}`);
  },

  enterpriseWorkspaces() {
    return jsonGet<{ workspaces: EnterpriseWorkspaceOption[] }>("/enterprise/workspaces");
  },

  checkoutPro() {
    return jsonPost<{ url: string }>("/checkout/pro");
  },

  checkoutEnterprise(workspaceId: string) {
    return jsonPost<{ url: string }>("/checkout/enterprise", { workspaceId });
  },

  enterprisePortal(workspaceId: string) {
    return jsonPost<{ url: string }>("/portal/enterprise", { workspaceId });
  },

  enableOnDemand(limitUsd: number | null = 25) {
    return jsonPost<{ ok: boolean }>("/on-demand/enable", { limitUsd });
  },

  setOnDemandLimit(limitUsd: number | null) {
    return jsonPost<{ ok: boolean }>("/on-demand/limit", { limitUsd });
  },

  disableOnDemand() {
    return jsonPost<{ ok: boolean }>("/on-demand/disable");
  },

  portal() {
    return jsonPost<{ url: string }>("/portal");
  },
};
