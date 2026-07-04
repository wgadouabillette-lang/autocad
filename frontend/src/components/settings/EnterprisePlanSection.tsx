import clsx from "clsx";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";

const ENTERPRISE_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "enterprise");

interface EnterprisePlanSectionProps {
  loading?: boolean;
  workspaceEnterpriseActive: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export default function EnterprisePlanSection({
  workspaceEnterpriseActive,
  disabled = true,
  onClick,
}: EnterprisePlanSectionProps) {
  if (!ENTERPRISE_PLAN) return null;

  return (
    <button
      type="button"
      className={clsx(
        "settings-plan-card w-full",
        workspaceEnterpriseActive && "settings-plan-card--active",
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label="Forfait Entreprise — bientôt disponible"
    >
      <div className="settings-plan-card__header">
        <span className="settings-plan-card__name">{ENTERPRISE_PLAN.label}</span>
        <span className="settings-plan-card__price">{ENTERPRISE_PLAN.price}</span>
      </div>
      <p className="settings-plan-card__desc">{ENTERPRISE_PLAN.description}</p>
      <ul className="settings-plan-card__features">
        {ENTERPRISE_PLAN.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <p className="settings-plan-card__action">Bientôt disponible</p>
    </button>
  );
}

export function resolveEnterpriseWorkspace() {
  return null;
}
