import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";
import SettingsPlanCard from "./SettingsPlanCard";

const PRO_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "pro");
const ENTERPRISE_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "enterprise");

export default function PlanSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const isPro = subscriptionPlan === "pro" && billingManaged;
  const proActive = isPro && !workspaceEnterpriseActive;

  const handleProCheckout = () => {
    if (!isAuthenticated || isPro) return;
    // TODO: rediriger vers Stripe Checkout
    setSubscriptionPlan("pro");
  };

  if (!PRO_PLAN || !ENTERPRISE_PLAN) return null;

  return (
    <div className="settings-plan-grid">
      <SettingsPlanCard
        label={PRO_PLAN.label}
        price={PRO_PLAN.price}
        features={PRO_PLAN.features}
        active={proActive}
        ctaLabel={proActive ? "Plan actuel" : "S'abonner"}
        ctaDisabled={!isAuthenticated || proActive}
        onCtaClick={handleProCheckout}
      />
      <SettingsPlanCard
        label={ENTERPRISE_PLAN.label}
        price={ENTERPRISE_PLAN.price}
        features={ENTERPRISE_PLAN.features}
        active={workspaceEnterpriseActive}
        ctaLabel={workspaceEnterpriseActive ? "Plan actuel" : "S'abonner"}
        ctaDisabled
      />
    </div>
  );
}
