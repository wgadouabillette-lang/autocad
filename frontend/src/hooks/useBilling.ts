import { useCallback, useEffect, useState } from "react";
import {
  effectiveOnDemandUsage,
  effectiveSubscriptionPlan,
} from "../lib/subscriptionPlans";
import { billingApi, warmCheckoutAuth, type BillingConfig, type EnterpriseWorkspaceOption } from "../lib/billingApi";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { loadUserProfile, watchUserProfile } from "../lib/firebase/userData";
import { useAuthStore } from "../store/useAuthStore";
import { useStore } from "../store/useStore";

const DEFAULT_CONFIG: BillingConfig = {
  enabled: false,
  onDemandAvailable: false,
  billingManaged: false,
  proPriceLabel: "$30 / month",
  enterpriseEnabled: false,
  enterpriseMinMembers: 10,
  enterpriseSeatPriceLabel: "$18 / seat / month",
};

function isStripeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

function openStripeUrl(url: string): "external" | "tab" | "blocked" {
  if (!isStripeCheckoutUrl(url)) {
    throw new Error("URL Stripe invalide renvoyée par le serveur.");
  }

  if (hasFormaDesktop() && window.formaDesktop?.openExternal) {
    void window.formaDesktop.openExternal(url);
    return "external";
  }

  const tab = window.open(url, "_blank", "noopener,noreferrer");
  if (!tab) {
    return "blocked";
  }
  tab.focus?.();
  return "tab";
}

export function useBilling() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const billingManaged = useStore((s) => s.billingManaged);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [enterpriseWorkspaces, setEnterpriseWorkspaces] = useState<EnterpriseWorkspaceOption[]>([]);
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

  const loadEnterpriseWorkspaces = useCallback(async () => {
    if (!isAuthenticated) {
      setEnterpriseWorkspaces([]);
      return [];
    }
    try {
      const { workspaces } = await billingApi.enterpriseWorkspaces();
      setEnterpriseWorkspaces(workspaces);
      return workspaces;
    } catch {
      setEnterpriseWorkspaces([]);
      return [];
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadConfig();
    void loadEnterpriseWorkspaces();
    if (isAuthenticated) {
      warmCheckoutAuth();
    }
  }, [firebaseUid, isAuthenticated, loadConfig, loadEnterpriseWorkspaces]);

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
      setExternalCheckoutOpen(false);
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

  const startStripeFlow = useCallback(
    async (fetchUrl: () => Promise<{ url: string }>, options?: { waitForUpdate?: boolean }) => {
      const waitForUpdate = options?.waitForUpdate !== false;
      if (!isAuthenticated) {
        setError("Connectez-vous pour gérer la facturation.");
        return;
      }

      setError(null);
      setLoading(true);

      try {
        const { url } = await fetchUrl();
        const mode = openStripeUrl(url);
        if (mode === "blocked") {
          setError("Autorisez les pop-ups pour ouvrir Stripe, puis réessayez.");
          setLoading(false);
          return;
        }
        setExternalCheckoutOpen(true);
        if (!waitForUpdate) {
          setLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Stripe indisponible.");
        setLoading(false);
      }
    },
    [isAuthenticated],
  );

  const checkoutPro = useCallback(async () => {
    if (!config?.enabled) {
      setError("Stripe Pro n'est pas configuré sur le serveur (backend/.env).");
      return;
    }
    await startStripeFlow(() => billingApi.checkoutPro());
  }, [config?.enabled, startStripeFlow]);

  const openPortal = useCallback(async () => {
    await startStripeFlow(() => billingApi.portal(), { waitForUpdate: false });
  }, [startStripeFlow]);

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

  const dismissExternalCheckoutNotice = useCallback(() => {
    setExternalCheckoutOpen(false);
    setLoading(false);
  }, []);

  const checkoutEnterprise = useCallback(
    async (workspaceId: string) => {
      if (!config?.enterpriseEnabled) {
        setError("Stripe Entreprise n'est pas configuré sur le serveur (backend/.env).");
        return;
      }
      await startStripeFlow(() => billingApi.checkoutEnterprise(workspaceId));
    },
    [config?.enterpriseEnabled, startStripeFlow],
  );

  const openEnterprisePortal = useCallback(
    async (workspaceId: string) => {
      await startStripeFlow(() => billingApi.enterprisePortal(workspaceId), { waitForUpdate: false });
    },
    [startStripeFlow],
  );

  const prefetchCheckout = useCallback(() => {
    warmCheckoutAuth();
  }, []);

  return {
    config,
    loading,
    error,
    setBillingError: setError,
    externalCheckoutOpen,
    dismissExternalCheckoutNotice,
    checkoutPro,
    checkoutEnterprise,
    openPortal,
    openEnterprisePortal,
    prefetchCheckout,
    setOnDemand,
    setOnDemandLimit,
    refreshProfile,
    enterpriseWorkspaces,
    loadEnterpriseWorkspaces,
    stripeEnabled: Boolean(config?.enabled),
    enterpriseEnabled: Boolean(config?.enterpriseEnabled),
    enterpriseMinMembers: config?.enterpriseMinMembers ?? DEFAULT_CONFIG.enterpriseMinMembers,
    enterpriseSeatPriceLabel:
      config?.enterpriseSeatPriceLabel ?? DEFAULT_CONFIG.enterpriseSeatPriceLabel,
    billingManaged,
    onDemandAvailable: Boolean(config?.onDemandAvailable),
    proPriceLabel: config?.proPriceLabel ?? DEFAULT_CONFIG.proPriceLabel,
  };
}
