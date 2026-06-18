import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "../../store/useStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useBilling } from "../../hooks/useBilling";
import type { UsageStatus } from "../../lib/billingApi";
import EnterprisePlanSection, { resolveEnterpriseWorkspace } from "./EnterprisePlanSection";
import OnDemandLimitSection from "./OnDemandLimitSection";
import {
  SUBSCRIPTION_PLANS,
  canEnableOnDemandUsage,
} from "../../lib/subscriptionPlans";

const PRO_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "pro");

interface PlanSettingsSectionProps {
  personalUsage?: UsageStatus | null;
  usageLoading?: boolean;
  onUsageRefresh?: () => Promise<void>;
}

export default function PlanSettingsSection({
  personalUsage = null,
  usageLoading = false,
  onUsageRefresh,
}: PlanSettingsSectionProps) {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const onDemandUsageEnabled = useStore((s) => s.onDemandUsageEnabled);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onDemandAvailable = canEnableOnDemandUsage(subscriptionPlan);
  const isPro = subscriptionPlan === "pro";
  const {
    stripeEnabled,
    billingManaged,
    onDemandAvailable: stripeOnDemand,
    proPriceLabel,
    loading,
    error,
    setBillingError,
    externalCheckoutOpen,
    checkoutPro,
    checkoutEnterprise,
    openPortal,
    openEnterprisePortal,
    prefetchCheckout,
    setOnDemand,
    setOnDemandLimit,
    enterpriseEnabled,
    enterpriseWorkspaces,
    enterpriseSeatPriceLabel,
  } = useBilling();

  const handleUpgrade = () => {
    if (!isAuthenticated || !stripeEnabled || loading) return;
    if (isPro && billingManaged) {
      void openPortal();
      return;
    }
    void checkoutPro();
  };

  const handleEnterprise = () => {
    if (!isAuthenticated || loading) return;

    const target = resolveEnterpriseWorkspace(enterpriseWorkspaces, activeRoomId);
    if (!target) {
      setBillingError("Aucun workspace éligible pour Entreprise.");
      return;
    }
    if (target.enterpriseActive) {
      void openEnterprisePortal(target.workspaceId);
      return;
    }
    if (!target.eligible) {
      setBillingError(
        `Le workspace « ${target.name} » requiert au moins ${target.minMembers} membres.`,
      );
      return;
    }
    void checkoutEnterprise(target.workspaceId);
  };

  const handleOnDemandToggle = () => {
    if (!onDemandAvailable) return;
    if (stripeEnabled && stripeOnDemand) {
      void setOnDemand(!onDemandUsageEnabled, 25);
    }
  };

  const handleSetLimit = async (limitUsd: number | null) => {
    await setOnDemandLimit(limitUsd);
    await onUsageRefresh?.();
  };

  if (!PRO_PLAN) return null;

  return (
    <>
      {!isAuthenticated && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Connectez-vous pour souscrire à Pro et ouvrir la page de paiement Stripe.
          </p>
        </section>
      )}
      {isAuthenticated && !stripeEnabled && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Stripe n&apos;est pas configuré sur le serveur (clés manquantes dans backend/.env).
          </p>
        </section>
      )}
      {externalCheckoutOpen && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Stripe est ouvert dans un autre onglet. Restez ici — votre forfait se mettra à jour
            automatiquement dès confirmation du paiement.
          </p>
        </section>
      )}
      {error && (
        <section className="settings-section">
          <p className="settings-section__hint text-red-400">{error}</p>
        </section>
      )}

      <div className="settings-plan-grid">
        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            isPro && billingManaged && "settings-plan-card--active",
          )}
          disabled={loading || !isAuthenticated || !stripeEnabled}
          onClick={handleUpgrade}
          onPointerEnter={prefetchCheckout}
          aria-label={
            isPro && billingManaged
              ? "Gérer l'abonnement Pro via Stripe"
              : "Souscrire au forfait Pro via Stripe Checkout"
          }
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{PRO_PLAN.label}</span>
            <span className="settings-plan-card__price inline-flex items-center gap-1">
              {stripeEnabled ? proPriceLabel : PRO_PLAN.price}
              {stripeEnabled && !loading && (
                <ArrowUpRight size={13} strokeWidth={2.25} className="shrink-0 opacity-70" aria-hidden />
              )}
            </span>
          </div>
          <p className="settings-plan-card__desc">{PRO_PLAN.description}</p>
          <ul className="settings-plan-card__features">
            {PRO_PLAN.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          {loading && (
            <p className="settings-plan-card__action">
              {externalCheckoutOpen
                ? "En attente de confirmation Stripe…"
                : "Ouverture de Stripe…"}
            </p>
          )}
          {!loading && isPro && billingManaged && (
            <p className="settings-plan-card__action">Gérer l&apos;abonnement Stripe</p>
          )}
        </button>

        <EnterprisePlanSection
          loading={loading}
          externalCheckoutOpen={externalCheckoutOpen}
          enterpriseEnabled={enterpriseEnabled}
          enterpriseSeatPriceLabel={enterpriseSeatPriceLabel}
          workspaceEnterpriseActive={workspaceEnterpriseActive}
          disabled={
            loading ||
            !isAuthenticated ||
            (!enterpriseEnabled && !workspaceEnterpriseActive)
          }
          onClick={handleEnterprise}
          onPrefetchCheckout={prefetchCheckout}
        />

        <section className="settings-section settings-section--card settings-plan-grid__full">
        <h3 className="settings-section__label">Usage à la demande</h3>
        <p className="settings-section__hint">
          Add-on optionnel facturé au-delà de votre forfait Pro (via Stripe metered).
        </p>
        <button
          type="button"
          disabled={!onDemandAvailable || loading || (stripeEnabled && !stripeOnDemand)}
          onClick={handleOnDemandToggle}
          className={clsx(
            "settings-option w-full",
            onDemandAvailable && onDemandUsageEnabled && "settings-option--active",
            !onDemandAvailable && "opacity-50",
          )}
        >
          <span className="settings-option__title">
            {onDemandUsageEnabled ? "Add-on activé" : "Activer l'usage à la demande"}
          </span>
          <span className="settings-option__subtitle">
            {!onDemandAvailable
              ? "Abonnement Pro requis."
              : stripeEnabled && !stripeOnDemand
                ? "Add-on non configuré côté serveur."
                : onDemandUsageEnabled
                  ? billingManaged
                    ? "Synchronisé avec votre abonnement Stripe."
                    : "Facturation au fil des requêtes, en plus du forfait mensuel."
                  : "Par défaut plafond 25 $ — modifiable après activation."}
          </span>
        </button>

        {onDemandUsageEnabled && onDemandAvailable && (
          <OnDemandLimitSection
            usage={personalUsage}
            loading={usageLoading}
            saving={loading}
            error={error}
            onSetLimit={handleSetLimit}
          />
        )}
      </section>
      </div>
    </>
  );
}
