import { useCallback, useEffect, useState } from "react";
import { billingApi, type BillingConfig } from "../lib/billingApi";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { loadUserProfile, watchUserProfile } from "../lib/firebase/userData";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";

const DEFAULT_CONFIG: BillingConfig = {
  enabled: false,
  onDemandAvailable: false,
  billingManaged: false,
  proPriceLabel: "$30 / month",
};

async function openCheckoutUrl(url: string): Promise<{ openedExternal: boolean }> {
  if (hasFormaDesktop() && window.formaDesktop?.openExternal) {
    try {
      await window.formaDesktop.openExternal(url);
      return { openedExternal: true };
    } catch {
      // Fall back to in-window navigation if the bridge call fails.
    }
  }
  window.location.assign(url);
  return { openedExternal: false };
}

export function useBilling() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalCheckoutOpen, setExternalCheckoutOpen] = useState(false);

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
  }, [firebaseUid, isAuthenticated, loadConfig]);

  // Real-time sync of the user's plan from Firestore. The Stripe webhook writes
  // `subscriptionPlan` / `onDemandUsageEnabled` on `users/{uid}` after payment,
  // so the desktop (Mac/Win) and web apps both reflect the change instantly.
  useEffect(() => {
    if (!firebaseUid) return;
    const unsubscribe = watchUserProfile(firebaseUid, (profile) => {
      if (!profile) return;
      useStore.setState((state) => {
        const patch: Partial<{
          subscriptionPlan: typeof profile.subscriptionPlan;
          onDemandUsageEnabled: boolean;
        }> = {};
        if (
          profile.subscriptionPlan &&
          profile.subscriptionPlan !== state.subscriptionPlan
        ) {
          patch.subscriptionPlan = profile.subscriptionPlan;
        }
        if (
          typeof profile.onDemandUsageEnabled === "boolean" &&
          profile.onDemandUsageEnabled !== state.onDemandUsageEnabled
        ) {
          patch.onDemandUsageEnabled = profile.onDemandUsageEnabled;
        }
        return Object.keys(patch).length > 0 ? patch : state;
      });
      // When a plan change lands while we were waiting on an external checkout,
      // clear the pending UI so the user gets immediate feedback.
      setExternalCheckoutOpen(false);
      setLoading(false);
    });
    return unsubscribe;
  }, [firebaseUid]);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUid) return;
    const profile = await loadUserProfile(firebaseUid);
    if (!profile) return;
    useStore.setState({
      subscriptionPlan: profile.subscriptionPlan,
      onDemandUsageEnabled: profile.onDemandUsageEnabled,
    });
    await loadConfig();
  }, [firebaseUid, loadConfig]);

  const checkoutPro = useCallback(async () => {
    if (!isAuthenticated) {
      setError("Connectez-vous pour souscrire à Pro.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { url } = await billingApi.checkoutPro();
      const { openedExternal } = await openCheckoutUrl(url);
      if (openedExternal) {
        setExternalCheckoutOpen(true);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout impossible.");
      setLoading(false);
    }
  }, [isAuthenticated]);

  const openPortal = useCallback(async () => {
    if (!isAuthenticated) {
      setError("Connectez-vous pour gérer votre abonnement.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { url } = await billingApi.portal();
      const { openedExternal } = await openCheckoutUrl(url);
      if (openedExternal) {
        setExternalCheckoutOpen(true);
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portail facturation indisponible.");
      setLoading(false);
    }
  }, [isAuthenticated]);

  const setOnDemand = useCallback(
    async (enabled: boolean) => {
      if (!isAuthenticated) {
        setError("Connectez-vous pour modifier l'usage à la demande.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (enabled) {
          await billingApi.enableOnDemand();
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

  const dismissExternalCheckoutNotice = useCallback(() => {
    setExternalCheckoutOpen(false);
  }, []);

  return {
    config,
    loading,
    error,
    externalCheckoutOpen,
    dismissExternalCheckoutNotice,
    checkoutPro,
    openPortal,
    setOnDemand,
    refreshProfile,
    stripeEnabled: Boolean(config?.enabled),
    billingManaged: Boolean(config?.billingManaged),
    onDemandAvailable: Boolean(config?.onDemandAvailable),
    proPriceLabel: config?.proPriceLabel ?? DEFAULT_CONFIG.proPriceLabel,
  };
}
