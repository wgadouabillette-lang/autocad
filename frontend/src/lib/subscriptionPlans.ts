import i18n from "./i18n";
import {
  PRO_INCLUDED_CREDIT_USD,
  PRO_PLUS_INCLUDED_CREDIT_USD,
  TEAM_INCLUDED_CREDIT_PER_SEAT_USD,
  type PlanCatalogId,
  type SubscriptionPlan,
  type WorkspaceEnterprisePlan,
} from "./subscriptionPlanConstants";

export type { PlanCatalogId, SubscriptionPlan, WorkspaceEnterprisePlan };
export {
  PRO_INCLUDED_CREDIT_USD,
  PRO_PLUS_INCLUDED_CREDIT_USD,
  TEAM_INCLUDED_CREDIT_PER_SEAT_USD,
};

export interface PlanDefinition {
  id: SubscriptionPlan | "enterprise";
  label: string;
  price: string;
  description: string;
  features: string[];
}

export interface PlanCatalogCard {
  id: PlanCatalogId;
  eyebrow: string;
  label: string;
  description: string;
  features: string[];
}

/** Settings → Plan & Usage cards. */
export function planCatalogCards(_locale?: string): PlanCatalogCard[] {
  const t = i18n.t.bind(i18n);
  return [
    {
      id: "pro",
      eyebrow: t("billing.plans.personal"),
      label: "Pro",
      description: t("billing.plans.proDesc"),
      features: [
        t("billing.plans.proCredit", { amount: PRO_INCLUDED_CREDIT_USD }),
        t("billing.plans.unlimitedServers"),
        t("billing.plans.aiAssistant"),
        t("billing.plans.aiNotesFollowup"),
        t("billing.plans.aiModelChoice"),
      ],
    },
    {
      id: "proPlus",
      eyebrow: t("billing.plans.personal"),
      label: "Pro+",
      description: t("billing.plans.proPlusDesc"),
      features: [
        t("billing.plans.proPlusCredit", { amount: PRO_PLUS_INCLUDED_CREDIT_USD }),
        t("billing.plans.unlimitedServers"),
        t("billing.plans.aiAssistant"),
        t("billing.plans.aiNotesFollowup"),
        t("billing.plans.aiModelChoice"),
      ],
    },
    {
      id: "team",
      eyebrow: t("billing.plans.workspace"),
      label: "Team",
      description: t("billing.plans.teamDesc"),
      features: [
        t("billing.plans.chooseSeats"),
        t("billing.plans.aiForMembers"),
        t("billing.plans.teamCredit", { amount: TEAM_INCLUDED_CREDIT_PER_SEAT_USD }),
        t("billing.plans.workspaceAiNotes"),
        t("billing.plans.centralizedBilling"),
      ],
    },
  ];
}

export function planSettingsCopy(_locale?: string) {
  const t = i18n.t.bind(i18n);
  return {
    signIn: t("billing.signIn"),
    stripeMissing: t("billing.stripeMissing"),
    externalCheckout: t("billing.externalCheckout"),
    proAria: t("billing.proAria"),
    proPlusAria: t("billing.proPlusAria"),
    teamAria: t("billing.teamAria"),
    teamAddSeatsAria: t("billing.teamAddSeatsAria"),
    ctaPro: t("billing.ctaPro"),
    ctaProPlus: t("billing.ctaProPlus"),
    ctaTeam: t("billing.ctaTeam"),
    ctaCurrent: t("billing.ctaCurrent"),
    ctaTeamAddSeats: t("billing.ctaTeamAddSeats"),
    ctaOpening: t("billing.ctaOpening"),
    ctaWaiting: t("billing.ctaWaiting"),
    errorSignInPro: t("billing.errorSignInPro"),
    errorSignInTeam: t("billing.errorSignInTeam"),
    proPriceFallback: t("billing.proPriceFallback"),
    proPlusPriceFallback: t("billing.proPlusPriceFallback"),
    teamPriceFallback: t("billing.teamPriceFallback"),
  };
}


export const ENTERPRISE_MIN_MEMBERS = 2;

export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    id: "free",
    label: "Gratuit",
    price: "0 €",
    description: "Workspace, appels et messagerie entre amis.",
    features: [
      "Workspace et appels vocaux",
      "Jusqu'à 3 serveurs personnels",
      "Amis et messages",
      "Connecteurs inclus",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "33 $ / mois",
    description: "Assistant IA personnel avec crédits mensuels.",
    features: [
      "Serveurs personnels illimités",
      "Crédits IA mensuels inclus",
      "Assistant IA dans tout Meetra",
      "AI Notes et Follow-up",
      "Choix du modèle IA",
    ],
  },
  {
    id: "enterprise",
    label: "Entreprise",
    price: "24 $ / siège",
    description: "IA partagée pour tout le workspace.",
    features: [
      "IA pour tous les membres du workspace",
      "Pool IA partagé (24 $ × siège / mois)",
      "AI Notes et Follow-up workspace",
      "Facturation centralisée",
    ],
  },
];

export const FREE_OWNED_WORKSPACE_LIMIT = 3;

export function planLabel(plan: SubscriptionPlan): string {
  return plan === "pro" ? i18n.t("billing.planPro") : i18n.t("billing.planFree");
}

export type PlanBadgeKind = "free" | "pro" | "proPlus" | "teams" | "teamsPro" | "teamsProPlus";

/** Label capsule header (support / settings). */
export function resolvePlanBadgeLabel(opts: {
  subscriptionPlan: SubscriptionPlan;
  billingManaged?: boolean;
  subscriptionTier?: string | null;
  workspaceEnterpriseActive?: boolean;
}): { kind: PlanBadgeKind; label: string } {
  const isPro =
    opts.billingManaged === true &&
    effectiveSubscriptionPlan(opts.subscriptionPlan, opts.billingManaged) === "pro";
  const isProPlus = isPro && opts.subscriptionTier === "proPlus";
  const isTeams = opts.workspaceEnterpriseActive === true;

  if (isTeams && isProPlus) return { kind: "teamsProPlus", label: "Teams + Pro+" };
  if (isTeams && isPro) return { kind: "teamsPro", label: "Teams + Pro" };
  if (isTeams) return { kind: "teams", label: "teams" };
  if (isProPlus) return { kind: "proPlus", label: "pro+" };
  if (isPro) return { kind: "pro", label: "pro" };
  return { kind: "free", label: "free" };
}

/** Pro uniquement si billingManaged est actif (paiement confirmé ou toggle dev local). */
export function effectiveSubscriptionPlan(
  subscriptionPlan: unknown,
  billingManaged: unknown,
): SubscriptionPlan {
  return billingManaged === true && subscriptionPlan === "pro" ? "pro" : "free";
}

export function effectiveWorkspaceEnterprise(
  enterpriseSubscriptionPlan: unknown,
  enterpriseBillingManaged: unknown,
): boolean {
  return (
    enterpriseBillingManaged === true && enterpriseSubscriptionPlan === "enterprise"
  );
}

export function effectiveOnDemandUsage(
  subscriptionPlan: SubscriptionPlan,
  onDemandUsageEnabled: unknown,
  billingManaged: unknown,
): boolean {
  return (
    subscriptionPlan === "pro" &&
    billingManaged === true &&
    onDemandUsageEnabled === true
  );
}

export function canCreateOwnedWorkspace(
  ownedWorkspaceCount: number,
  subscriptionPlan: SubscriptionPlan,
  billingManaged = false,
): boolean {
  if (effectiveSubscriptionPlan(subscriptionPlan, billingManaged) === "pro") return true;
  return ownedWorkspaceCount < FREE_OWNED_WORKSPACE_LIMIT;
}

export function ownedWorkspaceLimitMessage(
  subscriptionPlan: SubscriptionPlan,
  billingManaged = false,
): string {
  if (effectiveSubscriptionPlan(subscriptionPlan, billingManaged) === "pro") {
    return i18n.t("billing.ownedLimitPro");
  }
  return i18n.t("billing.ownedLimitFree", { limit: FREE_OWNED_WORKSPACE_LIMIT });
}

export function hasPersonalAiAccess(
  plan: SubscriptionPlan,
  billingManaged = false,
): boolean {
  return effectiveSubscriptionPlan(plan, billingManaged) === "pro";
}

export function hasAiAccess(
  plan: SubscriptionPlan,
  billingManaged = false,
  workspaceEnterprise = false,
): boolean {
  return hasPersonalAiAccess(plan, billingManaged) || workspaceEnterprise;
}

export function hasAiNotesAccess(
  plan: SubscriptionPlan,
  billingManaged = false,
  workspaceEnterprise = false,
): boolean {
  return hasAiAccess(plan, billingManaged, workspaceEnterprise);
}

export function hasFollowUpAccess(
  plan: SubscriptionPlan,
  billingManaged = false,
  workspaceEnterprise = false,
): boolean {
  return hasAiAccess(plan, billingManaged, workspaceEnterprise);
}

export function hasRecapSkillAccess(
  plan: SubscriptionPlan,
  billingManaged = false,
  workspaceEnterprise = false,
): boolean {
  return hasAiAccess(plan, billingManaged, workspaceEnterprise);
}

export function hasConnectorAccess(_plan: SubscriptionPlan): boolean {
  return true;
}

/** L'usage à la demande nécessite un abonnement Pro personnel actif. */
export function canEnableOnDemandUsage(plan: SubscriptionPlan): boolean {
  return plan === "pro";
}

export function hasOnDemandUsage(
  plan: SubscriptionPlan,
  onDemandUsageEnabled: boolean,
): boolean {
  return canEnableOnDemandUsage(plan) && onDemandUsageEnabled;
}

export function billingModeLabel(
  plan: SubscriptionPlan,
  onDemandUsageEnabled: boolean,
): string {
  if (plan !== "pro") return "—";
  if (onDemandUsageEnabled) return "Abonnement + usage à la demande";
  return "Abonnement";
}
