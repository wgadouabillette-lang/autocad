import clsx from "clsx";
import { ArrowUpRight, Check } from "lucide-react";
import { useEffect } from "react";
import { useBilling } from "../../hooks/useBilling";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";
import EnterprisePlanSection, {
  resolveEnterpriseWorkspace,
} from "./EnterprisePlanSection";

const FREE_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "free");
const PRO_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "pro");

export default function PlanSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const isPro = subscriptionPlan === "pro" && billingManaged;
  const {
    stripeEnabled,
    proPriceLabel,
    loading,
    error,
    externalCheckoutOpen,
    enterpriseEnabled,
    enterpriseSeatPriceLabel,
    checkoutPro,
    checkoutEnterprise,
    openPortal,
    openEnterprisePortal,
    enterpriseWorkspaces,
    loadEnterpriseWorkspaces,
    prefetchCheckout,
    setBillingError,
  } = useBilling();

  useEffect(() => {
    void loadEnterpriseWorkspaces();
  }, [loadEnterpriseWorkspaces]);

  const enterpriseWorkspace = resolveEnterpriseWorkspace(enterpriseWorkspaces, activeRoomId);

  const handleSelectFree = () => {
    if (!isPro && !workspaceEnterpriseActive) return;
    if (isPro && billingManaged && stripeEnabled) {
      void openPortal();
      return;
    }
    setBillingError(
      workspaceEnterpriseActive
        ? "Pour résilier Entreprise, ouvrez le portail Stripe depuis la carte Entreprise."
        : "Le plan gratuit s'active après résiliation dans le portail Stripe.",
    );
  };

  const handleSelectPro = () => {
    if (!isAuthenticated) {
      setBillingError("Connectez-vous pour souscrire à Pro.");
      return;
    }
    if (!stripeEnabled) {
      setBillingError("Stripe n'est pas configuré sur le serveur (backend/.env).");
      return;
    }
    if (isPro) {
      void openPortal();
      return;
    }
    void checkoutPro();
  };

  const handleEnterpriseClick = () => {
    const target =
      enterpriseWorkspace ??
      (activeRoomId?.trim()
        ? {
            workspaceId: activeRoomId.trim().toLowerCase(),
            name: activeRoomId,
            memberCount: 0,
            minMembers: 2,
            eligible: false,
            enterpriseActive: workspaceEnterpriseActive,
          }
        : null);

    if (!target?.workspaceId) {
      setBillingError("Sélectionnez un workspace pour le forfait Entreprise.");
      return;
    }
    if (target.enterpriseActive || workspaceEnterpriseActive) {
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

  if (!FREE_PLAN || !PRO_PLAN) return null;

  return (
    <>
      {!isAuthenticated && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Connectez-vous pour souscrire via Stripe Checkout.
          </p>
        </section>
      )}
      {isAuthenticated && !stripeEnabled && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Stripe n&apos;est pas configuré sur le serveur — ajoutez les clés dans backend/.env.
          </p>
        </section>
      )}
      {externalCheckoutOpen && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Stripe est ouvert dans un autre onglet. Votre forfait se met à jour automatiquement
            dès confirmation du paiement.
          </p>
        </section>
      )}
      {error ? <p className="settings-section__hint mt-2 text-red-400">{error}</p> : null}

      <div className="settings-plan-grid">
        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            !isPro && !workspaceEnterpriseActive && "settings-plan-card--active",
          )}
          disabled={loading || (!isPro && !workspaceEnterpriseActive)}
          onClick={handleSelectFree}
          aria-label="Plan Gratuit"
          aria-pressed={!isPro && !workspaceEnterpriseActive}
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{FREE_PLAN.label}</span>
            <span className="settings-plan-card__price inline-flex items-center gap-1">
              {FREE_PLAN.price}
              {!isPro && !workspaceEnterpriseActive && (
                <Check size={13} strokeWidth={2.5} className="shrink-0 opacity-80" aria-hidden />
              )}
            </span>
          </div>
          <p className="settings-plan-card__desc">{FREE_PLAN.description}</p>
          <ul className="settings-plan-card__features">
            {FREE_PLAN.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          {!isPro && !workspaceEnterpriseActive && (
            <p className="settings-plan-card__action">Plan actif</p>
          )}
          {(isPro || workspaceEnterpriseActive) && stripeEnabled && (
            <p className="settings-plan-card__action">Résilier via le portail Stripe</p>
          )}
        </button>

        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            isPro && !workspaceEnterpriseActive && "settings-plan-card--active",
          )}
          disabled={loading || !isAuthenticated || !stripeEnabled}
          onClick={handleSelectPro}
          onPointerEnter={prefetchCheckout}
          aria-label={
            isPro ? "Gérer l'abonnement Pro via Stripe" : "Souscrire au forfait Pro via Stripe Checkout"
          }
          aria-pressed={isPro && !workspaceEnterpriseActive}
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{PRO_PLAN.label}</span>
            <span className="settings-plan-card__price inline-flex items-center gap-1">
              {stripeEnabled ? proPriceLabel : PRO_PLAN.price}
              {stripeEnabled && !loading && (
                <ArrowUpRight size={13} strokeWidth={2.25} className="shrink-0 opacity-70" aria-hidden />
              )}
              {isPro && !workspaceEnterpriseActive && (
                <Check size={13} strokeWidth={2.5} className="shrink-0 opacity-80" aria-hidden />
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
          {!loading && isPro && !workspaceEnterpriseActive && (
            <p className="settings-plan-card__action">Gérer l&apos;abonnement Stripe</p>
          )}
        </button>

        <div className="settings-plan-grid__full">
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
            onClick={handleEnterpriseClick}
            onPrefetchCheckout={prefetchCheckout}
          />
        </div>
      </div>
    </>
  );
}
