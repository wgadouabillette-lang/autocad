import clsx from "clsx";
import { Check } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";
import EnterprisePlanSection from "./EnterprisePlanSection";

const FREE_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "free");
const PRO_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "pro");

export default function PlanSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const isPro = subscriptionPlan === "pro" && billingManaged;

  const handleSelectFree = () => {
    if (!isPro && !workspaceEnterpriseActive) return;
    if (isPro) setSubscriptionPlan("free");
  };

  const handleSelectPro = () => {
    if (!isAuthenticated) return;
    if (isPro) return;
    setSubscriptionPlan("pro");
  };

  if (!FREE_PLAN || !PRO_PLAN) return null;

  return (
    <>
      <section className="settings-section">
        <p className="settings-section__hint">
          La facturation en ligne sera réintégrée prochainement. En attendant, le forfait Pro
          peut être activé localement pour les tests.
        </p>
      </section>

      <div className="settings-plan-grid">
        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            !isPro && !workspaceEnterpriseActive && "settings-plan-card--active",
          )}
          disabled={!isPro && !workspaceEnterpriseActive}
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
        </button>

        <button
          type="button"
          className={clsx(
            "settings-plan-card w-full",
            isPro && !workspaceEnterpriseActive && "settings-plan-card--active",
          )}
          disabled={!isAuthenticated || isPro}
          onClick={handleSelectPro}
          aria-label="Forfait Pro (dev local)"
          aria-pressed={isPro && !workspaceEnterpriseActive}
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{PRO_PLAN.label}</span>
            <span className="settings-plan-card__price inline-flex items-center gap-1">
              {PRO_PLAN.price}
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
          {isPro && !workspaceEnterpriseActive && (
            <p className="settings-plan-card__action">Plan actif (dev)</p>
          )}
        </button>

        <div className="settings-plan-grid__full">
          <EnterprisePlanSection
            loading={false}
            workspaceEnterpriseActive={workspaceEnterpriseActive}
            disabled
            onClick={() => {}}
          />
        </div>
      </div>
    </>
  );
}
