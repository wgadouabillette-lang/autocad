import { useCallback, useEffect, useState } from "react";
import { billingApi, type BillingSummary } from "../lib/billingApi";
import { planLabel } from "../lib/subscriptionPlans";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";

function localBillingSummary(
  subscriptionPlan: "free" | "pro",
  billingManaged: boolean,
  workspaceEnterpriseActive: boolean,
  activeRoomId: string | null,
): BillingSummary {
  if (workspaceEnterpriseActive && activeRoomId) {
    return {
      currentPlan: "enterprise",
      planLabel: "Entreprise",
      billingManaged: true,
      workspaceId: activeRoomId,
      nextBillingDate: null,
      cancelAtPeriodEnd: false,
      stripeEnabled: false,
      transactions: [],
    };
  }
  if (subscriptionPlan === "pro" && billingManaged) {
    return {
      currentPlan: "pro",
      planLabel: "Pro",
      billingManaged: true,
      nextBillingDate: null,
      cancelAtPeriodEnd: false,
      stripeEnabled: false,
      transactions: [],
    };
  }
  if (subscriptionPlan === "pro") {
    return {
      currentPlan: "pro",
      planLabel: "Pro (local)",
      billingManaged: false,
      nextBillingDate: null,
      cancelAtPeriodEnd: false,
      stripeEnabled: false,
      transactions: [],
    };
  }
  return {
    currentPlan: "free",
    planLabel: planLabel("free"),
    billingManaged: false,
    nextBillingDate: null,
    cancelAtPeriodEnd: false,
    stripeEnabled: false,
    transactions: [],
  };
}

export function useBillingSummary() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const settingsTab = useStore((s) => s.settingsTab);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setSummary(
        localBillingSummary(
          subscriptionPlan,
          billingManaged,
          workspaceEnterpriseActive,
          activeRoomId,
        ),
      );
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const workspaceId =
        workspaceEnterpriseActive && activeRoomId ? activeRoomId : null;
      const next = await billingApi.summary(workspaceId);
      if (
        !next.stripeEnabled &&
        next.currentPlan === "free" &&
        subscriptionPlan === "pro"
      ) {
        setSummary(
          localBillingSummary(
            subscriptionPlan,
            billingManaged,
            workspaceEnterpriseActive,
            activeRoomId,
          ),
        );
        return;
      }
      setSummary(next);
    } catch (err) {
      setSummary(
        localBillingSummary(
          subscriptionPlan,
          billingManaged,
          workspaceEnterpriseActive,
          activeRoomId,
        ),
      );
      setError(err instanceof Error ? err.message : "Impossible de charger la facturation.");
    } finally {
      setLoading(false);
    }
  }, [
    activeRoomId,
    billingManaged,
    isAuthenticated,
    subscriptionPlan,
    workspaceEnterpriseActive,
  ]);

  useEffect(() => {
    if (settingsTab !== "billing") return;
    void load();
  }, [load, settingsTab]);

  return { summary, loading, error, reload: load };
}
