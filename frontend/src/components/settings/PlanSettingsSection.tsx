import clsx from "clsx";
import { ArrowUpRight, Check } from "lucide-react";
import { useEffect } from "react";
import { useBoostedWorkspaces } from "../../hooks/useBoostedWorkspaces";
import { useBilling } from "../../hooks/useBilling";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";
import BoostedWorkspacesList from "./BoostedWorkspacesList";
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
  const boostedWorkspaces = useBoostedWorkspaces(enterpriseWorkspaces);

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
    // Paiement toujours via Payment Element (overlay) — le portail Stripe
    // reste sur « Résilier » (plan Gratuit) pour gérer un abonnement existant.
    void checkoutPro();
  };

  const handleEnterpriseClick = () => {
    if (!isAuthenticated) {
      setBillingError("Connectez-vous pour souscrire à Entreprise.");
      return;
    }

    void (async () => {
      const workspaces = await loadEnterpriseWorkspaces();
      const preferred =
        resolveEnterpriseWorkspace(workspaces, activeRoomId) ??
        (activeRoomId?.trim()
          ? {
              workspaceId: activeRoomId.trim().toLowerCase(),
              name: activeRoomId,
              memberCount: 0,
              minMembers: 2,
              eligible: false,
              enterpriseActive: workspaceEnterpriseActive,
              isOwner: true,
            }
          : null);

      // Déjà Entreprise sur le workspace actif → portail de gestion.
      if (preferred && (preferred.enterpriseActive || workspaceEnterpriseActive)) {
        void openEnterprisePortal(preferred.workspaceId);
        return;
      }

      await checkoutEnterprise(preferred?.workspaceId ?? activeRoomId);
    })();
  };

  if (!FREE_PLAN || !PRO_PLAN) return null;

  return (
    <>
      {!isAuthenticated && (
        <section className="settings-section">
          <p className="settings-section__hint text-amber-300">
            Connectez-vous pour souscrire via Stripe.
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
          disabled={loading || !isAuthenticated}
          onClick={handleSelectPro}
          onPointerEnter={prefetchCheckout}
          aria-label="Ouvrir le paiement Pro"
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
          {!loading && !isPro && !workspaceEnterpriseActive && (
            <p className="settings-plan-card__action">Passer à Pro</p>
          )}
          {!loading && isPro && !workspaceEnterpriseActive && (
            <p className="settings-plan-card__action">Plan actif — rouvrir le paiement</p>
          )}
        </button>

        <div className="settings-plan-grid__full">
          <EnterprisePlanSection
            loading={loading}
            externalCheckoutOpen={externalCheckoutOpen}
            enterpriseEnabled={enterpriseEnabled}
            enterpriseSeatPriceLabel={enterpriseSeatPriceLabel}
            workspaceEnterpriseActive={workspaceEnterpriseActive}
            disabled={loading || !isAuthenticated}
            onClick={handleEnterpriseClick}
            onPrefetchCheckout={prefetchCheckout}
          />
          <BoostedWorkspacesList
            workspaces={boostedWorkspaces}
            onCancelled={() => {
              void loadEnterpriseWorkspaces();
            }}
          />
        </div>
      </div>
    </>
  );
}
