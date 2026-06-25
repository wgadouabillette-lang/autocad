import { httpsCallable } from "firebase/functions";
import { billingApi } from "../billingApi";
import { functions } from "./client";

export async function syncDevSubscriptionToFirestore(
  plan: "free" | "pro",
  onDemandUsageEnabled: boolean,
): Promise<void> {
  const payload = { plan, onDemandUsageEnabled: plan === "pro" && onDemandUsageEnabled };

  if (import.meta.env.DEV) {
    try {
      await billingApi.syncDevPlan(payload);
      return;
    } catch {
      // Fall back to Cloud Functions when the local API is unavailable.
    }
  }

  try {
    const callable = httpsCallable<typeof payload, { ok: boolean }>(
      functions,
      "syncDevSubscriptionPlan",
    );
    await callable(payload);
  } catch (error) {
    if (!import.meta.env.DEV) {
      throw error instanceof Error ? error : new Error("Impossible de synchroniser le plan Pro.");
    }
    throw error instanceof Error ? error : new Error("Impossible de synchroniser le plan Pro.");
  }
}
