import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";

export type SettingsTab =
  | "general"
  | "friends"
  | "usage"
  | "agents"
  | "models"
  | "plugins"
  | "skills"
  | "workspace";

/** Anciens identifiants conservés pour la recherche et les liens profonds. */
export type LegacySettingsTab =
  | "chat"
  | "account"
  | "plan"
  | "billing"
  | "recording";

export type AnySettingsTab = SettingsTab | LegacySettingsTab;

const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "friends",
  "usage",
  "agents",
  "models",
  "plugins",
  "skills",
  "workspace",
];

const LEGACY_TAB_MAP: Record<LegacySettingsTab, SettingsTab> = {
  chat: "agents",
  account: "general",
  plan: "usage",
  billing: "usage",
  recording: "general",
};

export function normalizeSettingsTab(tab: string | null | undefined): SettingsTab {
  if (!tab) return "general";
  if (tab in LEGACY_TAB_MAP) {
    return LEGACY_TAB_MAP[tab as LegacySettingsTab];
  }
  if (SETTINGS_TABS.includes(tab as SettingsTab)) {
    return tab as SettingsTab;
  }
  return "general";
}

export interface SettingsSearchSuggestion {
  id: string;
  tab: SettingsTab;
  label: string;
  hint: string;
  keywords: string;
}

const BASE_SUGGESTIONS: SettingsSearchSuggestion[] = [
  {
    id: "chat-mode",
    tab: "agents",
    label: "Mode assistant",
    hint: "Bascule automatique Agent / Render",
    keywords: "chat assistant agent render automatique agents",
  },
  {
    id: "models",
    tab: "models",
    label: "Modèle IA",
    hint: "Choisir Opus, Claude ou Auto",
    keywords: "models modèle ia opus claude génération",
  },
  {
    id: "recording-camera",
    tab: "general",
    label: "Aperçu caméra",
    hint: "Webcam pendant l'enregistrement",
    keywords: "enregistrement caméra webcam écran general",
  },
  {
    id: "audio-devices",
    tab: "general",
    label: "Audio",
    hint: "Micro, sortie et réduction du bruit",
    keywords: "audio micro microphone haut-parleur sortie écho bruit general appel vocal",
  },
  {
    id: "friends",
    tab: "friends",
    label: "Liste d'amis",
    hint: "Ajouter et gérer vos amis",
    keywords: "amis friends demandes email messages",
  },
  {
    id: "plan-free",
    tab: "usage",
    label: "Forfait Gratuit",
    hint: "Workspace et appels sans IA",
    keywords: "forfait gratuit plan usage abonnement",
  },
  {
    id: "plan-pro",
    tab: "usage",
    label: "Forfait Pro",
    hint: "IA et connecteurs inclus",
    keywords: "forfait pro usage abonnement ia connecteurs plan",
  },
  {
    id: "billing",
    tab: "usage",
    label: "Facturation",
    hint: "Paiements et reçus",
    keywords: "billing facture paiement carte abonnement usage demande add-on",
  },
  {
    id: "account-name",
    tab: "general",
    label: "Nom affiché",
    hint: "Modifier votre identité",
    keywords: "compte profil nom general account",
  },
  {
    id: "account-email",
    tab: "general",
    label: "Email",
    hint: "Adresse de votre compte",
    keywords: "compte email adresse general account",
  },
  {
    id: "account-panel",
    tab: "general",
    label: "Panneau latéral",
    hint: "Position gauche ou droite",
    keywords: "interface panneau latéral gauche droite general",
  },
  {
    id: "skills",
    tab: "skills",
    label: "Skills",
    hint: "Compétences et automatisations",
    keywords: "skills compétences automatisations agents",
  },
  {
    id: "workspace",
    tab: "workspace",
    label: "Workspace",
    hint: "Nom du serveur et gestion des membres",
    keywords: "workspace serveur propriétaire membres expulser salon vocal",
  },
];

const PLUGIN_SUGGESTIONS: SettingsSearchSuggestion[] = CHAT_CONNECTORS.map((connector) => ({
  id: `plugin-${connector.id}`,
  tab: "plugins" as const,
  label: connector.label,
  hint: `Connecteur chat ${connector.slash}`,
  keywords: `plugins api connecteur ${connector.label} ${connector.slash} ${connector.id}`,
}));

export const SETTINGS_SEARCH_SUGGESTIONS: SettingsSearchSuggestion[] = [
  ...BASE_SUGGESTIONS,
  ...PLUGIN_SUGGESTIONS,
];

export function filterSettingsSuggestions(query: string): SettingsSearchSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return SETTINGS_SEARCH_SUGGESTIONS;
  return SETTINGS_SEARCH_SUGGESTIONS.filter((item) => {
    const haystack = `${item.label} ${item.hint} ${item.keywords}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
