import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { EnterpriseWorkspaceOption } from "../../lib/billingApi";
import { SUBSCRIPTION_PLANS } from "../../lib/subscriptionPlans";

const ENTERPRISE_PLAN = SUBSCRIPTION_PLANS.find((plan) => plan.id === "enterprise");

interface EnterprisePlanSectionProps {
  loading: boolean;
  externalCheckoutOpen: boolean;
  enterpriseEnabled: boolean;
  enterpriseSeatPriceLabel: string;
  workspaceEnterpriseActive: boolean;
  disabled: boolean;
  onClick: () => void;
  onPrefetchCheckout?: () => void;
}

export default function EnterprisePlanSection({
  loading,
  externalCheckoutOpen,
  enterpriseEnabled,
  enterpriseSeatPriceLabel,
  workspaceEnterpriseActive,
  disabled,
  onClick,
  onPrefetchCheckout,
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
      onPointerEnter={onPrefetchCheckout}
      aria-label={
        workspaceEnterpriseActive
          ? "Gérer l'abonnement Entreprise via Stripe"
          : "Souscrire au forfait Entreprise via Stripe Checkout"
      }
    >
      <div className="settings-plan-card__header">
        <span className="settings-plan-card__name">{ENTERPRISE_PLAN.label}</span>
        <span className="settings-plan-card__price inline-flex items-center gap-1">
          {enterpriseEnabled ? enterpriseSeatPriceLabel : ENTERPRISE_PLAN.price}
          {enterpriseEnabled && !loading && (
            <ArrowUpRight size={13} strokeWidth={2.25} className="shrink-0 opacity-70" aria-hidden />
          )}
        </span>
      </div>
      <p className="settings-plan-card__desc">{ENTERPRISE_PLAN.description}</p>
      <ul className="settings-plan-card__features">
        {ENTERPRISE_PLAN.features.map((feature) => (
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
      {!loading && workspaceEnterpriseActive && (
        <p className="settings-plan-card__action">Gérer l&apos;abonnement Stripe</p>
      )}
    </button>
  );
}

export function resolveEnterpriseWorkspace(
  enterpriseWorkspaces: EnterpriseWorkspaceOption[],
  activeRoomId: string | null,
): EnterpriseWorkspaceOption | null {
  if (activeRoomId) {
    const active = enterpriseWorkspaces.find((workspace) => workspace.workspaceId === activeRoomId);
    if (active) return active;
  }
  const withEnterprise = enterpriseWorkspaces.find((workspace) => workspace.enterpriseActive);
  if (withEnterprise) return withEnterprise;
  return enterpriseWorkspaces.find((workspace) => workspace.eligible) ?? null;
}
