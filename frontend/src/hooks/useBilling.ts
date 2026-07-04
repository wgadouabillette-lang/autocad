import { useCallback, useEffect, useState } from "react";
import {
  effectiveOnDemandUsage,
  effectiveSubscriptionPlan,
} from "../lib/subscriptionPlans";
import { billingApi, type BillingConfig } from "../lib/billingApi";
import { loadUserProfile, watchUserProfile } from "../lib/firebase/userData";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";

const DEFAULT_CONFIG: BillingConfig = {
  enabled: false,
  onDemandAvailable: false,
  billingManaged: false,
  proPriceLabel: "$30 / month",
  enterpriseEnabled: false,
  enterpriseMinMembers: 2,
  enterpriseSeatPriceLabel: "$18 / seat / month",
};

export function useBilling() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const billingManaged = useStore((s) => s.billingManaged);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const value = await billingApi.config();
      setConfig(value);
      return value;
    } catch {
      setConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [firebaseUid, loadConfig]);

  useEffect(() => {
    if (!firebaseUid) return;
    const unsubscribe = watchUserProfile(firebaseUid, (profile) => {
      if (!profile) return;
      const managed = profile.billingManaged === true;
      const subscriptionPlan = effectiveSubscriptionPlan(profile.subscriptionPlan, managed);
      const onDemandUsageEnabled = effectiveOnDemandUsage(
        subscriptionPlan,
        profile.onDemandUsageEnabled,
        managed,
      );
      useStore.setState((state) => {
        const patch: Partial<{
          subscriptionPlan: typeof subscriptionPlan;
          onDemandUsageEnabled: boolean;
          billingManaged: boolean;
        }> = {};
        if (subscriptionPlan !== state.subscriptionPlan) {
          patch.subscriptionPlan = subscriptionPlan;
        }
        if (onDemandUsageEnabled !== state.onDemandUsageEnabled) {
          patch.onDemandUsageEnabled = onDemandUsageEnabled;
        }
        if (managed !== state.billingManaged) {
          patch.billingManaged = managed;
        }
        return Object.keys(patch).length > 0 ? patch : state;
      });
      setLoading(false);
    });
    return unsubscribe;
  }, [firebaseUid]);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUid) return;
    const profile = await loadUserProfile(firebaseUid);
    if (!profile) return;
    const managed = profile.billingManaged === true;
    const subscriptionPlan = effectiveSubscriptionPlan(profile.subscriptionPlan, managed);
    const onDemandUsageEnabled = effectiveOnDemandUsage(
      subscriptionPlan,
      profile.onDemandUsageEnabled,
      managed,
    );
    useStore.setState({
      subscriptionPlan,
      onDemandUsageEnabled,
      billingManaged: managed,
    });
    await loadConfig();
  }, [firebaseUid, loadConfig]);

  const setOnDemand = useCallback(
    async (enabled: boolean, limitUsd: number | null = 25) => {
      if (!isAuthenticated) {
        setError("Connectez-vous pour modifier l'usage à la demande.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (enabled) {
          await billingApi.enableOnDemand(limitUsd);
        } else {
          await billingApi.disableOnDemand();
        }
        await refreshProfile();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mise à jour impossible.");
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, refreshProfile],
  );

  const setOnDemandLimit = useCallback(
    async (limitUsd: number | null) => {
      if (!isAuthenticated) {
        setError("Connectez-vous pour modifier le plafond à la demande.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await billingApi.setOnDemandLimit(limitUsd);
        await refreshProfile();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Mise à jour du plafond impossible.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, refreshProfile],
  );

  return {
    config,
    loading,
    error,
    setBillingError: setError,
    setOnDemand,
    setOnDemandLimit,
    refreshProfile,
    stripeEnabled: false,
    enterpriseEnabled: false,
    enterpriseWorkspaces: [],
    loadEnterpriseWorkspaces: async () => [],
    checkoutPro: async () => {
      setError("La facturation en ligne n'est pas disponible pour le moment.");
    },
    checkoutEnterprise: async () => {
      setError("La facturation en ligne n'est pas disponible pour le moment.");
    },
    openPortal: async () => {
      setError("La facturation en ligne n'est pas disponible pour le moment.");
    },
    openEnterprisePortal: async () => {
      setError("La facturation en ligne n'est pas disponible pour le moment.");
    },
    prefetchCheckout: () => {},
    externalCheckoutOpen: false,
    dismissExternalCheckoutNotice: () => {},
    syncFromStripe: async () => null,
    billingManaged,
    onDemandAvailable: false,
    proPriceLabel: config?.proPriceLabel ?? DEFAULT_CONFIG.proPriceLabel,
    enterpriseMinMembers: DEFAULT_CONFIG.enterpriseMinMembers,
    enterpriseSeatPriceLabel: DEFAULT_CONFIG.enterpriseSeatPriceLabel,
  };
}
