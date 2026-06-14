import clsx from "clsx";
import { useStore } from "../../store/useStore";
import { useAuthStore } from "../../store/useAuthStore";
import { useBilling } from "../../hooks/useBilling";
import {
  SUBSCRIPTION_PLANS,
  billingModeLabel,
  canEnableOnDemandUsage,
  planLabel,
  type SubscriptionPlan,
} from "../../lib/subscriptionPlans";

export default function PlanSettingsSection() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const onDemandUsageEnabled = useStore((s) => s.onDemandUsageEnabled);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const toggleOnDemandUsage = useStore((s) => s.toggleOnDemandUsage);
  const llmEnabled = useStore((s) => s.llmEnabled);
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
  } = useBilling();

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    if (plan === "pro") {
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
    }

    if (plan === "free" && billingManaged) {
      void openPortal();
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

  return (
    <>
      <section className="settings-section">
        <h3 className="settings-section__label">Forfait actuel</h3>
        <p className="settings-section__hint">
          Forfait sélectionné :{" "}
          <span className="text-muted-200">{planLabel(subscriptionPlan)}</span>
          {subscriptionPlan === "pro" && (
            <>
              {" "}
              ·{" "}
              <span className="text-muted-300">
                {billingModeLabel(subscriptionPlan, onDemandUsageEnabled)}
              </span>
            </>
          )}
        </p>
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

      <div className="settings-plan-grid">
        {SUBSCRIPTION_PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            disabled={loading}
            onClick={() => handlePlanSelect(plan.id)}
            className={clsx(
              "settings-plan-card",
              subscriptionPlan === plan.id && "settings-plan-card--active",
            )}
          >
            <div className="settings-plan-card__header">
              <span className="settings-plan-card__name">{plan.label}</span>
              <span className="settings-plan-card__price">
                {plan.id === "pro" && stripeEnabled ? proPriceLabel : plan.price}
              </span>
            </div>
            <p className="settings-plan-card__desc">{plan.description}</p>
            <ul className="settings-plan-card__features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {stripeEnabled && plan.id === "pro" && subscriptionPlan !== "pro" && (
              <p className="settings-plan-card__desc">Cliquer pour ouvrir la page de paiement Stripe</p>
            )}
          </button>
        ))}
      </div>

      <section className="settings-section settings-section--card">
        <h3 className="settings-section__label">Usage à la demande</h3>
        <p className="settings-section__hint">
          Complément pay-as-you-go, activable en plus de l&apos;abonnement Pro. Sans abonnement,
          cette option reste indisponible.
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
              ? "Passez au forfait Pro pour débloquer cette option."
              : stripeEnabled && !stripeOnDemand
                ? "Add-on non configuré côté serveur."
                : onDemandUsageEnabled
                  ? billingManaged
                    ? "Synchronisé avec votre abonnement Stripe."
                    : "Facturation au fil des requêtes, en complément du quota mensuel."
                  : "Facturation au fil des requêtes, en complément du quota mensuel."}
          </span>
        </button>
      </section>

      {subscriptionPlan === "pro" && (
        <section className="settings-section settings-section--card">
          <h3 className="settings-section__label">Statut IA</h3>
          <dl className="settings-kv">
            <div className="settings-kv__row">
              <dt>LLM</dt>
              <dd>{llmEnabled ? "Connecté" : "Mode règles"}</dd>
            </div>
          </dl>
        </section>
      )}
    </>
  );
}
