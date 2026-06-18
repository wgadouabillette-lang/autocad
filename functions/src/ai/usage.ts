import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  enterpriseUsageAllowanceUsd,
  normalizePricingModel,
  proUsageAllowanceUsd,
  modelUsageRate,
  splitRetailCharge,
  usageCostUsd,
  usageMarkupMultiplier,
} from "./usagePricing";
import { reportOnDemandStripeUsage, resetOnDemandStripeReporting } from "../billing/onDemandUsage";

function onDemandBilledUsd(doc: Record<string, unknown>): number {
  const stored = doc.onDemandUsedUsdRetail;
  if (typeof stored === "number") return Math.max(0, stored);
  const used = Number(doc.usedUsdRetail ?? 0);
  const allowance =
    typeof doc.allowanceUsdRetail === "number"
      ? Number(doc.allowanceUsdRetail)
      : proUsageAllowanceUsd();
  return Math.max(0, used - allowance);
}

async function loadUserOnDemandLimit(uid: string): Promise<number | null> {
  const snap = await getFirestore().doc(`users/${uid}`).get();
  const raw = snap.data()?.onDemandLimitUsd;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export class UsageLimitError extends Error {
  usedUsd: number;
  allowanceUsd: number;
  onDemandAvailable: boolean;
  scope: "pro" | "enterprise";
  workspaceId?: string;
  onDemandLimitUsd?: number | null;
  onDemandUsedUsd: number;

  constructor(
    usedUsd: number,
    allowanceUsd: number,
    onDemandAvailable: boolean,
    scope: "pro" | "enterprise" = "pro",
    workspaceId?: string,
    onDemandLimitUsd?: number | null,
    onDemandUsedUsd = 0,
  ) {
    super("AI usage allowance exceeded.");
    this.usedUsd = usedUsd;
    this.allowanceUsd = allowanceUsd;
    this.onDemandAvailable = onDemandAvailable;
    this.scope = scope;
    this.workspaceId = workspaceId;
    this.onDemandLimitUsd = onDemandLimitUsd;
    this.onDemandUsedUsd = onDemandUsedUsd;
  }
}

export interface UsageTarget {
  scope: "pro" | "enterprise";
  key: string;
}

async function userUsageRef(uid: string) {
  return getFirestore().doc(`users/${uid}/private/usage`);
}

async function workspaceUsageRef(workspaceId: string) {
  return getFirestore().doc(`workspacesShared/${workspaceId.trim().toLowerCase()}/private/usage`);
}

export async function getUserSubscriptionState(
  uid: string,
): Promise<{ plan: "free" | "pro"; billingManaged: boolean; onDemand: boolean }> {
  const snap = await getFirestore().doc(`users/${uid}`).get();
  const data = snap.data() ?? {};
  const billingManaged = data.billingManaged === true;
  const onDemand = data.onDemandUsageEnabled === true;
  const plan =
    billingManaged && data.subscriptionPlan === "pro" ? ("pro" as const) : ("free" as const);
  return { plan, billingManaged, onDemand };
}

export async function getWorkspaceEnterpriseState(workspaceId: string): Promise<{
  plan: "free" | "enterprise";
  billingManaged: boolean;
  memberCount: number;
  seatCount: number;
}> {
  const wid = workspaceId.trim().toLowerCase();
  const snap = await getFirestore().doc(`workspacesShared/${wid}`).get();
  const data = snap.data() ?? {};
  const billingManaged = data.enterpriseBillingManaged === true;
  const plan =
    billingManaged && data.enterpriseSubscriptionPlan === "enterprise"
      ? ("enterprise" as const)
      : ("free" as const);
  let memberCount = Number(data.enterpriseMemberCount ?? 0);
  let seatCount = Number(data.enterpriseSeatCount ?? 0);
  if (memberCount <= 0) {
    const members = await getFirestore().collection(`workspacesShared/${wid}/members`).get();
    memberCount = members.size + (data.ownerId ? 1 : 0);
  }
  if (seatCount <= 0) seatCount = Math.max(memberCount, 1);
  return { plan, billingManaged, memberCount, seatCount };
}

export async function isWorkspaceMember(uid: string, workspaceId: string): Promise<boolean> {
  const wid = workspaceId.trim().toLowerCase();
  if (!uid || !wid) return false;
  const ws = await getFirestore().doc(`workspacesShared/${wid}`).get();
  const data = ws.data() ?? {};
  if (String(data.ownerId ?? "") === uid) return true;
  const member = await getFirestore().doc(`workspacesShared/${wid}/members/${uid}`).get();
  return member.exists;
}

function personalQuotaApplies(state: { plan: string; billingManaged: boolean }): boolean {
  return state.plan === "pro" && state.billingManaged;
}

function workspaceQuotaApplies(state: { plan: string; billingManaged: boolean }): boolean {
  return state.plan === "enterprise" && state.billingManaged;
}

export async function resolveUsageTarget(
  uid: string,
  workspaceId?: string,
): Promise<UsageTarget | null> {
  const wid = (workspaceId ?? "").trim().toLowerCase();
  if (wid) {
    const wsState = await getWorkspaceEnterpriseState(wid);
    if (workspaceQuotaApplies(wsState) && (await isWorkspaceMember(uid, wid))) {
      return { scope: "enterprise", key: wid };
    }
  }
  const userState = await getUserSubscriptionState(uid);
  if (personalQuotaApplies(userState)) {
    return { scope: "pro", key: uid };
  }
  return null;
}

async function loadUserUsageDoc(uid: string) {
  return ((await (await userUsageRef(uid)).get()).data() ?? {}) as Record<string, unknown>;
}

async function loadWorkspaceUsageDoc(workspaceId: string) {
  return ((await (await workspaceUsageRef(workspaceId)).get()).data() ?? {}) as Record<
    string,
    unknown
  >;
}

export function usageLimitMessage(err: UsageLimitError): string {
  const used = err.usedUsd.toFixed(2);
  const allowance = err.allowanceUsd.toFixed(2);
  if (err.scope === "enterprise") {
    return (
      `Le quota IA Entreprise de ce workspace est épuisé (${used} $ / ${allowance} $ ` +
      "au tarif Lyte, partagé entre tous les membres). " +
      "Contactez le propriétaire du workspace pour augmenter les sièges ou attendre le renouvellement."
    );
  }
  if (err.onDemandAvailable) {
    if (err.onDemandLimitUsd != null) {
      const usedOd = err.onDemandUsedUsd.toFixed(2);
      const limitOd = err.onDemandLimitUsd.toFixed(2);
      return (
        `Votre plafond d'usage à la demande est atteint (${usedOd} $ / ${limitOd} $ ` +
        "au-delà du forfait Pro). Augmentez la limite dans Paramètres → Plan & Usage."
      );
    }
    return (
      `Votre quota IA Pro est épuisé (${used} $ / ${allowance} $ au tarif Lyte). ` +
      "Activez l'**usage à la demande** dans Paramètres → Plan & Usage pour continuer."
    );
  }
  return (
    `Votre quota IA Pro est épuisé (${used} $ / ${allowance} $ au tarif Lyte). ` +
    "Renouvellement au prochain cycle de facturation."
  );
}

export async function ensureUsageAllowed(uid: string, target: UsageTarget): Promise<void> {
  if (target.scope === "enterprise") {
    if (!(await isWorkspaceMember(uid, target.key))) {
      throw new UsageLimitError(0, 0, false, "enterprise", target.key);
    }
    const wsState = await getWorkspaceEnterpriseState(target.key);
    const doc = await loadWorkspaceUsageDoc(target.key);
    const allowance =
      typeof doc.allowanceUsdRetail === "number"
        ? Number(doc.allowanceUsdRetail)
        : enterpriseUsageAllowanceUsd(wsState.seatCount);
    const used = Number(doc.usedUsdRetail ?? 0);
    if (used <= allowance + 1e-9) return;
    throw new UsageLimitError(used, allowance, false, "enterprise", target.key);
  }

  const userState = await getUserSubscriptionState(target.key);
  if (!personalQuotaApplies(userState)) {
    throw new UsageLimitError(0, 0, false, "pro");
  }
  const doc = await loadUserUsageDoc(target.key);
  const allowance =
    typeof doc.allowanceUsdRetail === "number"
      ? Number(doc.allowanceUsdRetail)
      : proUsageAllowanceUsd();
  const used = Number(doc.usedUsdRetail ?? 0);
  if (used <= allowance + 1e-9) return;
  if (userState.onDemand) {
    const limit = await loadUserOnDemandLimit(target.key);
    const onDemandUsed = onDemandBilledUsd(doc);
    if (limit == null || onDemandUsed <= limit + 1e-9) return;
    throw new UsageLimitError(
      used,
      allowance,
      true,
      "pro",
      undefined,
      limit,
      onDemandUsed,
    );
  }
  throw new UsageLimitError(used, allowance, true, "pro");
}

export async function recordLlmUsage(
  target: UsageTarget,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  uid?: string,
): Promise<void> {
  const retailCost = usageCostUsd(modelId, inputTokens, outputTokens, true);
  const providerCost = usageCostUsd(modelId, inputTokens, outputTokens, false);
  if (providerCost <= 0 && inputTokens <= 0 && outputTokens <= 0) return;

  const modelKey = normalizePricingModel(modelId);
  const mergeByModel = (
    existing: Record<string, unknown>,
    includedRetail: number,
    onDemandRetail: number,
  ): Record<string, Record<string, number>> => {
    const usageByModel = { ...(existing.usageByModel as Record<string, Record<string, number>>) };
    const row = { ...(usageByModel[modelKey] ?? {}) };
    row.inputTokens = Number(row.inputTokens ?? 0) + Math.max(0, inputTokens);
    row.outputTokens = Number(row.outputTokens ?? 0) + Math.max(0, outputTokens);
    row.usedUsdRetail = Number(row.usedUsdRetail ?? 0) + includedRetail;
    row.onDemandUsedUsdRetail = Number(row.onDemandUsedUsdRetail ?? 0) + onDemandRetail;
    row.usedUsdProvider = Number(row.usedUsdProvider ?? 0) + providerCost;
    const rates = modelUsageRate(modelId);
    row.retailInputUsdPer1M = rates.retailInputUsdPer1M;
    row.retailOutputUsdPer1M = rates.retailOutputUsdPer1M;
    usageByModel[modelKey] = row;
    return usageByModel;
  };

  if (target.scope === "enterprise") {
    const ref = await workspaceUsageRef(target.key);
    const existing = await loadWorkspaceUsageDoc(target.key);
    const wsState = await getWorkspaceEnterpriseState(target.key);
    await ref.set(
      {
        usedUsdRetail: Number(existing.usedUsdRetail ?? 0) + retailCost,
        usedUsdProvider: Number(existing.usedUsdProvider ?? 0) + providerCost,
        inputTokens: Number(existing.inputTokens ?? 0) + Math.max(0, inputTokens),
        outputTokens: Number(existing.outputTokens ?? 0) + Math.max(0, outputTokens),
        usageByModel: mergeByModel(existing, retailCost, 0),
        lastModel: modelId,
        lastUsedAt: new Date().toISOString(),
        ...(uid ? { lastUid: uid } : {}),
        allowanceUsdRetail:
          typeof existing.allowanceUsdRetail === "number"
            ? existing.allowanceUsdRetail
            : enterpriseUsageAllowanceUsd(wsState.seatCount),
        seatCount:
          typeof existing.seatCount === "number" ? existing.seatCount : wsState.seatCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const ref = await userUsageRef(target.key);
  const existing = await loadUserUsageDoc(target.key);
  const userState = await getUserSubscriptionState(target.key);
  const allowance =
    typeof existing.allowanceUsdRetail === "number"
      ? Number(existing.allowanceUsdRetail)
      : proUsageAllowanceUsd();
  const currentIncluded = Number(existing.usedUsdRetail ?? 0);
  const [includedRetail, onDemandRetail] = splitRetailCharge(
    providerCost,
    currentIncluded,
    allowance,
    userState.onDemand,
  );
  const newIncluded = currentIncluded + includedRetail;
  const newOnDemand = onDemandBilledUsd(existing) + onDemandRetail;

  await ref.set(
    {
      usedUsdRetail: newIncluded,
      onDemandUsedUsdRetail: newOnDemand,
      usedUsdProvider: Number(existing.usedUsdProvider ?? 0) + providerCost,
      inputTokens: Number(existing.inputTokens ?? 0) + Math.max(0, inputTokens),
      outputTokens: Number(existing.outputTokens ?? 0) + Math.max(0, outputTokens),
      usageByModel: mergeByModel(existing, includedRetail, onDemandRetail),
      lastModel: modelId,
      lastUsedAt: new Date().toISOString(),
      allowanceUsdRetail: allowance,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (userState.onDemand) {
    try {
      await reportOnDemandStripeUsage(target.key, newOnDemand);
    } catch {
      /* ignore Stripe reporting errors */
    }
  }
}

export async function maybeSyncUsagePeriod(
  uid: string,
  subscription: { current_period_start?: number; current_period_end?: number },
): Promise<void> {
  const stripeStart = subscription.current_period_start;
  if (!stripeStart) return;
  const ref = await userUsageRef(uid);
  const existing = await loadUserUsageDoc(uid);
  if (existing.stripePeriodStart === stripeStart) return;

  const periodEnd = subscription.current_period_end;
  await ref.set(
    {
      allowanceUsdRetail: proUsageAllowanceUsd(),
      usedUsdRetail: 0,
      onDemandUsedUsdRetail: 0,
      usedUsdProvider: 0,
      inputTokens: 0,
      outputTokens: 0,
      stripePeriodStart: stripeStart,
      periodStart: new Date(stripeStart * 1000).toISOString(),
      periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await resetOnDemandStripeReporting(uid);
}

export async function maybeSyncWorkspaceUsagePeriod(
  workspaceId: string,
  subscription: { current_period_start?: number; current_period_end?: number },
  seatCount: number,
): Promise<void> {
  const stripeStart = subscription.current_period_start;
  if (!stripeStart) return;
  const wid = workspaceId.trim().toLowerCase();
  const ref = await workspaceUsageRef(wid);
  const existing = await loadWorkspaceUsageDoc(wid);
  const seats = Math.max(Number(seatCount) || 0, 1);
  const newAllowance = enterpriseUsageAllowanceUsd(seats);

  if (existing.stripePeriodStart === stripeStart) {
    if (existing.allowanceUsdRetail !== newAllowance || existing.seatCount !== seats) {
      await ref.set({ allowanceUsdRetail: newAllowance, seatCount: seats }, { merge: true });
    }
    return;
  }

  const periodEnd = subscription.current_period_end;
  await ref.set(
    {
      allowanceUsdRetail: newAllowance,
      seatCount: seats,
      usedUsdRetail: 0,
      usedUsdProvider: 0,
      inputTokens: 0,
      outputTokens: 0,
      stripePeriodStart: stripeStart,
      periodStart: new Date(stripeStart * 1000).toISOString(),
      periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function checkUsageGate(uid: string, workspaceId?: string): Promise<string | null> {
  const target = await resolveUsageTarget(uid, workspaceId);
  if (!target) return null;
  try {
    await ensureUsageAllowed(uid, target);
  } catch (err) {
    if (err instanceof UsageLimitError) return usageLimitMessage(err);
    throw err;
  }
  return null;
}

export async function trackLlmResult(
  uid: string,
  modelId: string,
  result: { inputTokens?: number; outputTokens?: number; modelId?: string },
  workspaceId?: string,
): Promise<void> {
  const target = await resolveUsageTarget(uid, workspaceId);
  if (!target) return;
  const billingModel = result.modelId ?? modelId;
  const inputTokens = result.inputTokens ?? 0;
  const outputTokens = result.outputTokens ?? 0;
  if (inputTokens <= 0 && outputTokens <= 0) return;
  await recordLlmUsage(target, billingModel, inputTokens, outputTokens, uid);
}

export function publicMarkupMultiplier(): number {
  return usageMarkupMultiplier();
}

export async function hasEnterpriseWorkspaceAccess(
  uid: string,
  workspaceId?: string,
): Promise<boolean> {
  const wid = (workspaceId ?? "").trim().toLowerCase();
  if (!wid) return false;
  const wsState = await getWorkspaceEnterpriseState(wid);
  return workspaceQuotaApplies(wsState) && (await isWorkspaceMember(uid, wid));
}
