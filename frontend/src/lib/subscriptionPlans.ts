import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";

export type SubscriptionPlan = "free" | "pro";

export interface PlanDefinition {
  id: SubscriptionPlan;
  label: string;
  price: string;
  description: string;
  features: string[];
}

const CONNECTOR_LABELS = CHAT_CONNECTORS.map((c) => c.label);

export const SUBSCRIPTION_PLANS: PlanDefinition[] = [
  {
    id: "free",
    label: "Gratuit",
    price: "0 €",
    description: "Workspace, appels et messagerie entre amis.",
    features: [
      "Workspace et appels",
      "Liste d'amis et messages",
      "Mode règles (sans IA)",
      `Connecteurs : ${CONNECTOR_LABELS.join(", ")}`,
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$30 / mois",
    description: "Assistant IA — 30 $/mois via Stripe Checkout.",
    features: [
      "Assistant IA (Agent & Render)",
      "AI Notes — transcription live en appel vocal",
      "Follow-up — récap structuré, calendrier et e-mails après l'appel",
      "Choix du modèle IA",
      "Bascule automatique en mode Auto si limite API",
      "Usage à la demande disponible en complément (add-on)",
      "Bascule automatique Agent / Render",
    ],
  },
];

export function planLabel(plan: SubscriptionPlan): string {
  return plan === "pro" ? "Pro" : "Gratuit";
}

export function hasAiAccess(plan: SubscriptionPlan): boolean {
  return plan === "pro";
}

export function hasAiNotesAccess(plan: SubscriptionPlan): boolean {
  return plan === "pro";
}

export function hasFollowUpAccess(plan: SubscriptionPlan): boolean {
  return plan === "pro";
}

export function hasConnectorAccess(_plan: SubscriptionPlan): boolean {
  return true;
}

/** L'usage à la demande nécessite un abonnement Pro actif. */
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
