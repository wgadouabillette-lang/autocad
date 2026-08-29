import { resolveClientLocale } from "./billingCurrency";

export type SubscriptionPlan = "free" | "pro";
export type WorkspaceEnterprisePlan = "free" | "enterprise";
export type PlanCatalogId = "pro" | "proPlus" | "team";

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

/** Default Pro included credit (FORMA_PRO_USAGE_ALLOWANCE_USD). */
export const PRO_INCLUDED_CREDIT_USD = 30;
/** Pro+ included credit — 2× Pro. */
export const PRO_PLUS_INCLUDED_CREDIT_USD = PRO_INCLUDED_CREDIT_USD * 2;
/** Default Team credit per seat (FORMA_ENTERPRISE_USAGE_ALLOWANCE_USD_PER_SEAT). */
export const TEAM_INCLUDED_CREDIT_PER_SEAT_USD = 25;

function isFrenchLocale(locale = resolveClientLocale()): boolean {
  return locale.toLowerCase().startsWith("fr");
}

/** Settings → Plan & Usage cards. */
export function planCatalogCards(locale = resolveClientLocale()): PlanCatalogCard[] {
  const fr = isFrenchLocale(locale);
  if (fr) {
    return [
      {
        id: "pro",
        eyebrow: "Personnel",
        label: "Pro",
        description: "Forfait personnel — même accès que Pro+.",
        features: [
          `${PRO_INCLUDED_CREDIT_USD} $ de crédit IA utilisable / mois`,
          "Serveurs personnels illimités",
          "Assistant IA dans tout Meetra",
          "AI Notes et Follow-up",
          "Choix du modèle IA",
        ],
      },
      {
        id: "proPlus",
        eyebrow: "Personnel",
        label: "Pro+",
        description: "Même accès que Pro, avec le double de crédit utilisable.",
        features: [
          `${PRO_PLUS_INCLUDED_CREDIT_USD} $ de crédit IA utilisable / mois`,
          "Serveurs personnels illimités",
          "Assistant IA dans tout Meetra",
          "AI Notes et Follow-up",
          "Choix du modèle IA",
        ],
      },
      {
        id: "team",
        eyebrow: "Workspace",
        label: "Team",
        description: "Payez le nombre de sièges que vous voulez.",
        features: [
          "Nombre de sièges au choix",
          "IA pour tous les membres du workspace",
          `${TEAM_INCLUDED_CREDIT_PER_SEAT_USD} $ de crédit utilisable par siège / mois`,
          "AI Notes et Follow-up workspace",
          "Facturation centralisée",
        ],
      },
    ];
  }
  return [
    {
      id: "pro",
      eyebrow: "Personal",
      label: "Pro",
      description: "Personal plan — the same access as Pro+.",
      features: [
        `$${PRO_INCLUDED_CREDIT_USD} usable AI credit / month`,
        "Unlimited personal servers",
        "AI assistant across Meetra",
        "AI Notes and Follow-up",
        "Choice of AI model",
      ],
    },
    {
      id: "proPlus",
      eyebrow: "Personal",
      label: "Pro+",
      description: "Same access as Pro, with double usable credit.",
      features: [
        `$${PRO_PLUS_INCLUDED_CREDIT_USD} usable AI credit / month`,
        "Unlimited personal servers",
        "AI assistant across Meetra",
        "AI Notes and Follow-up",
        "Choice of AI model",
      ],
    },
    {
      id: "team",
      eyebrow: "Workspace",
      label: "Team",
      description: "Pay for the number of seats you want.",
      features: [
        "Choose how many seats to pay for",
        "AI for every workspace member",
        `$${TEAM_INCLUDED_CREDIT_PER_SEAT_USD} usable credit per seat / month`,
        "Workspace AI Notes and Follow-up",
        "Centralized billing",
      ],
    },
  ];
}

export function planSettingsCopy(locale = resolveClientLocale()) {
  const fr = isFrenchLocale(locale);
  if (fr) {
    return {
      signIn: "Connectez-vous pour souscrire via Stripe.",
      stripeMissing:
        "Stripe n'est pas configuré sur le serveur — ajoutez les clés dans backend/.env.",
      externalCheckout:
        "Stripe est ouvert dans un autre onglet. Votre forfait se met à jour automatiquement dès confirmation du paiement.",
      proAria: "Ouvrir le paiement Pro",
      proPlusAria: "Ouvrir le paiement Pro+",
      teamAria: "Souscrire au forfait Team pour le workspace sélectionné",
      teamManageAria: "Gérer l'abonnement Team via Stripe",
      ctaPro: "Passer à Pro",
      ctaProPlus: "Passer à Pro+",
      ctaTeam: "Choisir les sièges",
      ctaCurrent: "Plan actuel",
      ctaTeamManage: "Gérer l'abonnement",
      ctaOpening: "Ouverture de Stripe…",
      ctaWaiting: "En attente de confirmation Stripe…",
      errorSignInPro: "Connectez-vous pour souscrire à Pro.",
      errorSignInTeam: "Connectez-vous pour souscrire à Team.",
      proPriceFallback: "25 $ / mois",
      proPlusPriceFallback: "40 $ / mois",
      teamPriceFallback: "18 $ / siège",
    };
  }
  return {
    signIn: "Sign in to subscribe with Stripe.",
    stripeMissing: "Stripe is not configured on the server — add keys in backend/.env.",
    externalCheckout:
      "Stripe is open in another tab. Your plan updates automatically once payment is confirmed.",
    proAria: "Open Pro checkout",
    proPlusAria: "Open Pro+ checkout",
    teamAria: "Subscribe to Team for the selected workspace",
    teamManageAria: "Manage Team subscription via Stripe",
    ctaPro: "Upgrade to Pro",
    ctaProPlus: "Upgrade to Pro+",
    ctaTeam: "Choose seats",
    ctaCurrent: "Current plan",
    ctaTeamManage: "Manage subscription",
    ctaOpening: "Opening Stripe…",
    ctaWaiting: "Waiting for Stripe confirmation…",
    errorSignInPro: "Sign in to subscribe to Pro.",
    errorSignInTeam: "Sign in to subscribe to Team.",
    proPriceFallback: "$25 / month",
    proPlusPriceFallback: "$40 / month",
    teamPriceFallback: "$18 / seat",
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
    price: "25 $ / mois",
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
