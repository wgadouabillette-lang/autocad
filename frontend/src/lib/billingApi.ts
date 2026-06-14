import { getAuthIdToken } from "./firebase/authToken";

const BASE = "/api/billing";

export interface BillingConfig {
  enabled: boolean;
  onDemandAvailable: boolean;
  billingManaged: boolean;
  proPriceLabel: string;
}

export interface BillingStatus {
  subscriptionPlan: "free" | "pro";
  onDemandUsageEnabled: boolean;
  billingManaged: boolean;
  stripeSubscriptionStatus: string | null;
}

async function authHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getAuthIdToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function jsonGet<T>(path: string, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) {
    const token = await getAuthIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function jsonPost<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export const billingApi = {
  config() {
    return jsonGet<BillingConfig>("/config", false);
  },

  status() {
    return jsonGet<BillingStatus>("/status");
  },

  checkoutPro() {
    return jsonPost<{ url: string }>("/checkout/pro");
  },

  enableOnDemand() {
    return jsonPost<{ ok: boolean }>("/on-demand/enable");
  },

  disableOnDemand() {
    return jsonPost<{ ok: boolean }>("/on-demand/disable");
  },

  portal() {
    return jsonPost<{ url: string }>("/portal");
  },
};
