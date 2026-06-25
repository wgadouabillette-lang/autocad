import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { proUsageAllowanceUsd } from "../ai/usagePricing";

export interface SyncDevSubscriptionRequest {
  plan?: string;
  onDemandUsageEnabled?: boolean;
}

export async function syncDevSubscriptionPlan(
  uid: string,
  data: SyncDevSubscriptionRequest,
): Promise<{ ok: true; plan: "free" | "pro" }> {
  if (process.env.ALLOW_DEV_PLAN_SYNC === "0") {
    throw new HttpsError("failed-precondition", "Dev plan sync is disabled.");
  }

  const plan: "free" | "pro" = data.plan === "pro" ? "pro" : "free";
  const onDemand = plan === "pro" && data.onDemandUsageEnabled === true;
  const db = getFirestore();

  await db.doc(`users/${uid}`).set(
    {
      subscriptionPlan: plan,
      billingManaged: plan === "pro",
      onDemandUsageEnabled: onDemand,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  if (plan === "pro") {
    const usageRef = db.doc(`users/${uid}/private/usage`);
    const snap = await usageRef.get();
    const existing = snap.data() ?? {};
    if (typeof existing.allowanceUsdRetail !== "number") {
      const now = new Date().toISOString();
      await usageRef.set(
        {
          allowanceUsdRetail: proUsageAllowanceUsd(),
          usedUsdRetail: Number(existing.usedUsdRetail ?? 0),
          onDemandUsedUsdRetail: Number(existing.onDemandUsedUsdRetail ?? 0),
          usedUsdProvider: Number(existing.usedUsdProvider ?? 0),
          inputTokens: Number(existing.inputTokens ?? 0),
          outputTokens: Number(existing.outputTokens ?? 0),
          periodStart: typeof existing.periodStart === "string" ? existing.periodStart : now,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }

  return { ok: true, plan };
}
