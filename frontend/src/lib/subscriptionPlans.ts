import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";

export type SubscriptionPlan = "free" | "pro";
export type WorkspaceEnterprisePlan = "free" | "enterprise";

export interface PlanDefinition {
  id: SubscriptionPlan | "enterprise";
  label: string;
  price: string;
  description: string;
  features: string[];
}

const CONNECTOR_LABELS = CHAT_CONNECTORS.map((c) => c.label);

export const ENTERPRISE_MIN_MEMBERS = 10;

export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    id: "free",
    label: "Gratuit",
    price: "0 €",
    description: "Workspace, appels et messagerie entre amis.",
    features: [
      "Workspace et appels",
      "Jusqu'à 3 serveurs personnels",
      "Liste d'amis et messages",
      "Mode règles (sans IA)",
      `Connecteurs : ${CONNECTOR_LABELS.join(", ")}`,
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$30 / mois",
    description: "Assistant IA personnel — 30 $/mois de crédits IA au tarif Hall (marge incluse).",
    features: [
      "Serveurs personnels illimités",
      "30 $ de crédits IA / mois (facturés au tarif Hall, pas au coût fournisseur)",
      "Assistant IA (Agent & Render) partout",
      "AI Notes — transcription live en appel vocal",
      "Follow-up — récap structuré, calendrier et e-mails après l'appel",
      "Choix du modèle IA",
      "Usage à la demande disponible en complément (add-on)",
    ],
  },
  {
    id: "enterprise",
    label: "Entreprise",
    price: "Tarif par siège",
    description:
      "IA pour tout le workspace — minimum 10 membres, tarif compétitif par personne (style Discord Nitro).",
    features: [
      "Pool IA partagé pour tous les membres du workspace (25 $ × sièges / mois au tarif Hall)",
      "IA activée pour tous les membres du workspace choisi",
      "AI Notes et Follow-up dans ce workspace uniquement",
      "Facturation centralisée par le propriétaire du workspace",
      "Tarif dégressif par siège (Stripe Checkout)",
      "Pro personnel reste valable partout si vous l'avez déjà",
    ],
  },
];

export const FREE_OWNED_WORKSPACE_LIMIT = 3;

export function planLabel(plan: SubscriptionPlan): string {
  return plan === "pro" ? "Pro" : "Gratuit";
}

/** Pro uniquement si Stripe a confirmé le paiement (webhook → billingManaged). */
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
