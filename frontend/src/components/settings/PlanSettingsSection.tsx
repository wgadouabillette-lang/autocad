import clsx from "clsx";
import { useEffect } from "react";
import { useStore } from "../../store/useStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useBilling } from "../../hooks/useBilling";
import {
  SUBSCRIPTION_PLANS,
  canEnableOnDemandUsage,
  type SubscriptionPlan,
} from "../../lib/subscriptionPlans";

const PRO_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "pro");

export default function PlanSettingsSection() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const onDemandUsageEnabled = useStore((s) => s.onDemandUsageEnabled);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const toggleOnDemandUsage = useStore((s) => s.toggleOnDemandUsage);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onDemandAvailable = canEnableOnDemandUsage(subscriptionPlan);
  const {
    stripeEnabled,
    billingManaged,
    onDemandAvailable: stripeOnDemand,
    proPriceLabel,
    loading,
    error,
    checkoutPro,
    openPortal,
    setOnDemand,
    refreshProfile,
  } = useBilling();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      void refreshProfile();
    }
  }, [refreshProfile]);

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    if (plan !== "pro") return;

    if (subscriptionPlan === "pro" && billingManaged) {
      void openPortal();
      return;
    }
    if (stripeEnabled) {
      void checkoutPro();
      return;
    }
    if (!isAuthenticated) {
      return;
    }
    if (!stripeEnabled) {
      setSubscriptionPlan(plan);
    }
  };

  const handleOnDemandToggle = () => {
    if (!onDemandAvailable) return;
    if (stripeEnabled && stripeOnDemand) {
      void setOnDemand(!onDemandUsageEnabled);
      return;
    }
    toggleOnDemandUsage();
  };

  if (!PRO_PLAN) return null;

  return (
    <>
      {(stripeEnabled || !isAuthenticated || billingManaged || error) && (
        <section className="settings-section">
          {stripeEnabled && (
            <p className="settings-section__hint">
              Pro : {proPriceLabel} — le clic ouvre Stripe Checkout pour payer en ligne.
            </p>
          )}
          {!isAuthenticated && stripeEnabled && (
            <p className="settings-section__hint text-amber-300">
              Connectez-vous pour souscrire à Pro et ouvrir la page de paiement.
            </p>
          )}
          {billingManaged && (
            <p className="settings-section__hint">
              Abonnement géré par Stripe — modifications via le portail client.
            </p>
          )}
          {error && <p className="settings-section__hint text-red-400">{error}</p>}
        </section>
      )}

      <div className="settings-plan-grid">
        <button
          type="button"
          disabled={loading}
          onClick={() => handlePlanSelect("pro")}
          className={clsx(
            "settings-plan-card",
            subscriptionPlan === "pro" && "settings-plan-card--active",
          )}
        >
          <div className="settings-plan-card__header">
            <span className="settings-plan-card__name">{PRO_PLAN.label}</span>
            <span className="settings-plan-card__price">
              {stripeEnabled ? proPriceLabel : PRO_PLAN.price}
            </span>
          </div>
          <p className="settings-plan-card__desc">{PRO_PLAN.description}</p>
          <ul className="settings-plan-card__features">
            {PRO_PLAN.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          {stripeEnabled && subscriptionPlan !== "pro" && (
            <p className="settings-plan-card__desc">Cliquer pour ouvrir la page de paiement Stripe</p>
          )}
          {stripeEnabled && subscriptionPlan === "pro" && (
            <p className="settings-plan-card__desc">Cliquer pour gérer l&apos;abonnement via Stripe</p>
          )}
        </button>
      </div>

      <section className="settings-section settings-section--card">
        <h3 className="settings-section__label">On-demand usage</h3>
        <p className="settings-section__hint">
          Optional pay-as-you-go add-on on top of your Pro subscription.
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
            {onDemandUsageEnabled ? "Add-on enabled" : "Enable on-demand usage"}
          </span>
          <span className="settings-option__subtitle">
            {!onDemandAvailable
              ? "Subscribe to Pro to unlock this option."
              : stripeEnabled && !stripeOnDemand
                ? "Add-on not configured on the server."
                : onDemandUsageEnabled
                  ? billingManaged
                    ? "Synced with your Stripe subscription."
                    : "Billed per request, in addition to your monthly quota."
                  : "Billed per request, in addition to your monthly quota."}
          </span>
        </button>
      </section>
    </>
  );
}
