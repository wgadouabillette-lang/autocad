import { useCallback, useEffect, useState } from "react";
import {
  effectiveOnDemandUsage,
  effectiveSubscriptionPlan,
} from "../lib/subscriptionPlans";
import {
  billingApi,
  warmCheckoutAuth,
  type BillingConfig,
  type BillingStatus,
  type EnterpriseWorkspaceOption,
} from "../lib/billingApi";
import {
  resolveClientCountry,
  resolveClientCurrency,
  resolveClientLocale,
} from "../lib/billingCurrency";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { loadUserProfile, watchUserProfile } from "../lib/firebase/userData";
import { warmStripeJs } from "../lib/stripeClient";
import { useAuthStore } from "../store/useAuthStore";
import { useEnterpriseCheckoutStore } from "../store/useEnterpriseCheckoutStore";
import { useProCheckoutStore } from "../store/useProCheckoutStore";
import { useStore } from "../store/useStore";

const DEFAULT_CONFIG: BillingConfig = {
  enabled: false,
  onDemandAvailable: false,
  billingManaged: false,
  proPriceLabel: "$25 / month",
  enterpriseEnabled: false,
  enterpriseMinMembers: 2,
  enterpriseSeatPriceLabel: "$18 / seat",
  enterpriseSeatUnitAmountCents: 1800,
  publishableKey: "",
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
  const [localizedProLabel, setLocalizedProLabel] = useState<string | null>(null);
  const [localizedEnterpriseSeatLabel, setLocalizedEnterpriseSeatLabel] = useState<string | null>(
    null,
  );
  const [enterpriseWorkspaces, setEnterpriseWorkspaces] = useState<EnterpriseWorkspaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalCheckoutOpen, setExternalCheckoutOpen] = useState(false);

  const localizePlanLabels = useCallback(async (value: BillingConfig) => {
    const locale = resolveClientLocale();
    const country = resolveClientCountry();
    const currency = resolveClientCurrency();
    const proCents = value.proPriceUsdCents ?? 2500;
    const seatCents = value.enterpriseSeatUnitAmountCents ?? 1800;
    try {
      const [pro, seat] = await Promise.all([
        billingApi.localizeAmount({
          usdCents: proCents,
          currency,
          country,
          locale,
          frequency: "month",
        }),
        billingApi.localizeAmount({
          usdCents: seatCents,
          currency,
          country,
          locale,
          frequency: "seat-month",
        }),
      ]);
      setLocalizedProLabel(`${pro.amountLabel} ${pro.frequencyLabel}`.replace(/\s+/g, " ").trim());
      setLocalizedEnterpriseSeatLabel(
        `${seat.amountLabel} ${seat.frequencyLabel}`.replace(/\s+/g, " ").trim(),
      );
    } catch {
      setLocalizedProLabel(null);
      setLocalizedEnterpriseSeatLabel(null);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const value = await billingApi.config();
      setConfig(value);
      warmStripeJs(value.publishableKey);
      void localizePlanLabels(value);
      return value;
    } catch {
      setConfig(DEFAULT_CONFIG);
      setLocalizedProLabel(null);
      setLocalizedEnterpriseSeatLabel(null);
      return DEFAULT_CONFIG;
    }
  }, [localizePlanLabels]);

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
    void loadConfig().then((value) => {
      // Recaler Free si un abonnement incomplete / toggle dev a laissé un faux Pro.
      if (!isAuthenticated || !value.enabled) return;
      void billingApi
        .sync()
        .then((status) => {
          const subscriptionPlan = effectiveSubscriptionPlan(
            status.subscriptionPlan,
            status.billingManaged,
          );
          useStore.setState({
            subscriptionPlan,
            billingManaged: status.billingManaged,
            onDemandUsageEnabled: effectiveOnDemandUsage(
              subscriptionPlan,
              status.onDemandUsageEnabled,
              status.billingManaged,
            ),
          });
        })
        .catch(() => {
          /* webhook / profil restent la source de vérité */
        });
    });
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

  const syncFromStripe = useCallback(async (): Promise<BillingStatus | null> => {
    if (!isAuthenticated) return null;
    try {
      const status = await billingApi.sync();
      const subscriptionPlan = effectiveSubscriptionPlan(status.subscriptionPlan, status.billingManaged);
      useStore.setState({
        subscriptionPlan,
        onDemandUsageEnabled: status.onDemandUsageEnabled,
        billingManaged: status.billingManaged,
      });
      setExternalCheckoutOpen(false);
      setLoading(false);
      return status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Synchronisation Stripe impossible.");
      return null;
    }
  }, [isAuthenticated]);

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
    setError(null);
    useProCheckoutStore.getState().openCheckout();
  }, []);

  const openPortal = useCallback(async () => {
    if (!isAuthenticated) {
      setError("Connectez-vous pour gérer la facturation.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { url } = await billingApi.portal();
      const mode = openStripeUrl(url);
      if (mode === "blocked") {
        setError("Autorisez les pop-ups pour ouvrir Stripe, puis réessayez.");
        setLoading(false);
        return;
      }
      setExternalCheckoutOpen(true);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      // Profil Pro local sans customer Stripe → ouvrir le checkout Elements.
      if (/Aucun client Stripe/i.test(message)) {
        setLoading(false);
        useProCheckoutStore.getState().openCheckout();
        return;
      }
      setError(message || "Stripe indisponible.");
      setLoading(false);
    }
  }, [isAuthenticated]);

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
    async (preferredWorkspaceId?: string | null) => {
      setError(null);
      // Toujours recharger : la config peut être restée stale après ajout du prix Entreprise.
      const latest = await loadConfig();
      if (!latest.enterpriseEnabled) {
        setError(
          "Stripe Entreprise n'est pas configuré — ajoutez STRIPE_ENTERPRISE_SEAT_PRICE_ID puis relancez le backend.",
        );
        return;
      }
      useEnterpriseCheckoutStore.getState().openCheckout({
        preferredWorkspaceId: preferredWorkspaceId ?? null,
      });
    },
    [loadConfig],
  );

  const openEnterprisePortal = useCallback(
    async (workspaceId: string) => {
      await startStripeFlow(() => billingApi.enterprisePortal(workspaceId), { waitForUpdate: false });
    },
    [startStripeFlow],
  );

  const prefetchCheckout = useCallback(() => {
    warmCheckoutAuth();
    warmStripeJs(config?.publishableKey);
  }, [config?.publishableKey]);

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
    syncFromStripe,
    enterpriseWorkspaces,
    loadEnterpriseWorkspaces,
    stripeEnabled: Boolean(config?.enabled),
    enterpriseEnabled: Boolean(config?.enterpriseEnabled),
    enterpriseMinMembers: config?.enterpriseMinMembers ?? DEFAULT_CONFIG.enterpriseMinMembers,
    enterpriseSeatPriceLabel:
      localizedEnterpriseSeatLabel ??
      config?.enterpriseSeatPriceLabel ??
      DEFAULT_CONFIG.enterpriseSeatPriceLabel,
    enterpriseSeatUnitAmountCents: config?.enterpriseSeatUnitAmountCents ?? 1800,
    billingManaged,
    onDemandAvailable: Boolean(config?.onDemandAvailable),
    proPriceLabel: localizedProLabel ?? config?.proPriceLabel ?? DEFAULT_CONFIG.proPriceLabel,
  };
}
