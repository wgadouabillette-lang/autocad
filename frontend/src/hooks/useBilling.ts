import { useCallback, useState } from "react";
import { useStore } from "../store/useStore";
import type { EnterpriseWorkspaceOption } from "../lib/billingApi";

/**
 * Hook simplifié — Stripe est temporairement désactivé.
 * Le plan est piloté manuellement via `useStore.setSubscriptionPlan` et persisté en localStorage.
 *
 * Cette structure conserve l'API attendue par les composants existants
 * (UpgradeProButton, PlanSettingsSection, BillingSettingsSection) pour faciliter
 * la réintégration Stripe future. Les actions de paiement basculent simplement
 * `subscriptionPlan` au lieu d'ouvrir un Checkout Stripe.
 */
export function useBilling() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const setOnDemandUsageEnabled = useStore((s) => s.setOnDemandUsageEnabled);
  const [error, setError] = useState<string | null>(null);

  const togglePro = useCallback(() => {
    setSubscriptionPlan(subscriptionPlan === "pro" ? "free" : "pro");
  }, [setSubscriptionPlan, subscriptionPlan]);

  const checkoutPro = useCallback(async () => {
    togglePro();
  }, [togglePro]);

  const checkoutEnterprise = useCallback(async (_workspaceId: string) => {
    setError("Le forfait Entreprise est temporairement indisponible (Stripe désactivé).");
  }, []);

  const openPortal = useCallback(async () => {
    togglePro();
  }, [togglePro]);

  const openEnterprisePortal = useCallback(async (_workspaceId: string) => {
    setError("Le portail Entreprise est temporairement indisponible (Stripe désactivé).");
  }, []);

  const setOnDemand = useCallback(
    async (enabled: boolean, _limitUsd: number | null = 25) => {
      setOnDemandUsageEnabled(enabled);
    },
    [setOnDemandUsageEnabled],
  );

  const setOnDemandLimit = useCallback(async (_limitUsd: number | null) => {
    // Plafond on-demand non géré sans Stripe.
  }, []);

  const refreshProfile = useCallback(async () => {
    // Plus de Firestore à lire pour le plan — on reste sur le toggle local.
  }, []);

  const syncFromStripe = useCallback(async () => null, []);

  const noop = useCallback(() => {}, []);

  return {
    config: null,
    loading: false,
    error,
    setBillingError: setError,
    externalCheckoutOpen: false,
    dismissExternalCheckoutNotice: noop,
    checkoutPro,
    checkoutEnterprise,
    openPortal,
    openEnterprisePortal,
    prefetchCheckout: noop,
    setOnDemand,
    setOnDemandLimit,
    refreshProfile,
    syncFromStripe,
    togglePro,
    enterpriseWorkspaces: [] as EnterpriseWorkspaceOption[],
    loadEnterpriseWorkspaces: useCallback(async () => [] as EnterpriseWorkspaceOption[], []),
    stripeEnabled: false,
    enterpriseEnabled: false,
    enterpriseMinMembers: 10,
    enterpriseSeatPriceLabel: "—",
    billingManaged,
    onDemandAvailable: false,
    proPriceLabel: "—",
  };
}
