import clsx from "clsx";
import { Check } from "lucide-react";
import { useEffect } from "react";
import { useBilling } from "../../hooks/useBilling";
import { useStore } from "../../store/useStore";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";
import EnterprisePlanSection, {
  resolveEnterpriseWorkspace,
} from "./EnterprisePlanSection";

const FREE_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "free");
const PRO_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "pro");

export default function PlanSettingsSection() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const isPro = subscriptionPlan === "pro";
  const {
    loading,
    error,
    externalCheckoutOpen,
    enterpriseEnabled,
    enterpriseSeatPriceLabel,
    checkoutEnterprise,
    openEnterprisePortal,
    enterpriseWorkspaces,
    loadEnterpriseWorkspaces,
    setBillingError,
  } = useBilling();

  useEffect(() => {
    void loadEnterpriseWorkspaces();
  }, [loadEnterpriseWorkspaces]);

  const enterpriseWorkspace = resolveEnterpriseWorkspace(enterpriseWorkspaces, activeRoomId);

  const handleSelectFree = () => {
    if (!isPro) return;
    setSubscriptionPlan("free");
  };

  const handleSelectPro = () => {
    if (isPro) return;
    setSubscriptionPlan("pro");
  };

  const handleEnterpriseClick = () => {
    const workspaceId = enterpriseWorkspace?.workspaceId ?? activeRoomId?.trim().toLowerCase();
    if (!workspaceId) {
      setBillingError("Sélectionnez un workspace pour le forfait Entreprise.");
      return;
    }
    if (workspaceEnterpriseActive) {
      void openEnterprisePortal(workspaceId);
      return;
    }
    void checkoutEnterprise(workspaceId);
  };

  if (!FREE_PLAN || !PRO_PLAN) return null;

  return (
    <>
      <section className="settings-section">
        <p className="settings-section__hint">
          Stripe est temporairement désactivé. Vous pouvez basculer librement entre
          le plan Gratuit et le plan Pro pour tester l&apos;app. Le forfait Entreprise
          reste visible ci-dessous ; la souscription Stripe sera réactivée prochainement.
        </p>
        {error ? <p className="settings-section__hint mt-2 text-red-400">{error}</p> : null}
      </section>

      <div className="settings-plan-grid">
        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            !isPro && !workspaceEnterpriseActive && "settings-plan-card--active",
          )}
          onClick={handleSelectFree}
          aria-label="Activer le plan Gratuit"
          aria-pressed={!isPro && !workspaceEnterpriseActive}
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{FREE_PLAN.label}</span>
            <span className="settings-plan-card__price inline-flex items-center gap-1">
              {FREE_PLAN.price}
              {!isPro && !workspaceEnterpriseActive && (
                <Check
                  size={13}
                  strokeWidth={2.5}
                  className="shrink-0 opacity-80"
                  aria-hidden
                />
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
        </button>

        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            isPro && !workspaceEnterpriseActive && "settings-plan-card--active",
          )}
          onClick={handleSelectPro}
          aria-label="Activer le plan Pro"
          aria-pressed={isPro && !workspaceEnterpriseActive}
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{PRO_PLAN.label}</span>
            <span className="settings-plan-card__price inline-flex items-center gap-1">
              {PRO_PLAN.price}
              {isPro && !workspaceEnterpriseActive && (
                <Check
                  size={13}
                  strokeWidth={2.5}
                  className="shrink-0 opacity-80"
                  aria-hidden
                />
              )}
            </span>
          </div>
          <p className="settings-plan-card__desc">{PRO_PLAN.description}</p>
          <ul className="settings-plan-card__features">
            {PRO_PLAN.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          {isPro && !workspaceEnterpriseActive && (
            <p className="settings-plan-card__action">Plan actif</p>
          )}
        </button>

        <div className="settings-plan-grid__full">
          <EnterprisePlanSection
            loading={loading}
            externalCheckoutOpen={externalCheckoutOpen}
            enterpriseEnabled={enterpriseEnabled}
            enterpriseSeatPriceLabel={enterpriseSeatPriceLabel}
            workspaceEnterpriseActive={workspaceEnterpriseActive}
            disabled={loading}
            onClick={handleEnterpriseClick}
          />
        </div>
      </div>
    </>
  );
}
