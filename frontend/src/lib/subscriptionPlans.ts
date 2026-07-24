export type SubscriptionPlan = "free" | "pro";
export type WorkspaceEnterprisePlan = "free" | "enterprise";

export interface PlanDefinition {
  id: SubscriptionPlan | "enterprise";
  label: string;
  price: string;
  description: string;
  features: string[];
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
    price: "25 $ / mois",
    description: "Assistant IA personnel avec crédits mensuels.",
    features: [
      "Serveurs personnels illimités",
      "Crédits IA mensuels inclus",
      "Assistant IA dans tout Hall",
      "AI Notes et Follow-up",
      "Choix du modèle IA",
    ],
  },
  {
    id: "enterprise",
    label: "Entreprise",
    price: "18 $ / siège",
    description: "IA partagée pour tout le workspace.",
    features: [
      "IA pour tous les membres du workspace",
      "Pool IA partagé (18 $ × siège / mois)",
      "AI Notes et Follow-up workspace",
      "Facturation centralisée",
    ],
  },
];

export const FREE_OWNED_WORKSPACE_LIMIT = 3;

export function planLabel(plan: SubscriptionPlan): string {
  return plan === "pro" ? "Pro" : "Gratuit";
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
    return "Serveurs personnels illimités avec Pro.";
  }
  return `Jusqu'à ${FREE_OWNED_WORKSPACE_LIMIT} serveurs personnels sur le plan gratuit. Passez à Pro pour en créer davantage.`;
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
