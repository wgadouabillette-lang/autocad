import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";

export type SettingsTab =
  | "general"
  | "friends"
  | "workspaces"
  | "usage"
  | "billing"
  | "agents"
  | "voice"
  | "audio"
  | "models"
  | "plugins";

/** Anciens identifiants conservés pour la recherche et les liens profonds. */
export type LegacySettingsTab =
  | "chat"
  | "account"
  | "plan"
  | "recording"
  | "skills"
  | "workspace";

export type AnySettingsTab = SettingsTab | LegacySettingsTab;

const SETTINGS_TABS: SettingsTab[] = [
  "general",
  "friends",
  "workspaces",
  "usage",
  "billing",
  "agents",
  "voice",
  "audio",
  "models",
  "plugins",
];

const LEGACY_TAB_MAP: Record<LegacySettingsTab, SettingsTab> = {
  chat: "agents",
  account: "general",
  plan: "usage",
  recording: "voice",
  skills: "plugins",
  workspace: "workspaces",
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
    label: "Instructions chat",
    hint: "Personnaliser le comportement de l'assistant",
    keywords: "agents chat assistant instructions comportement agent render",
  },
  {
    id: "follow-up-agent",
    tab: "agents",
    label: "Instructions follow-up",
    hint: "Personnaliser récaps et e-mails après appel",
    keywords: "agents follow-up récap e-mail instructions appel",
  },
  {
    id: "ai-notes-agent",
    tab: "agents",
    label: "Instructions AI Notes",
    hint: "Personnaliser la prise de notes live",
    keywords: "agents ai notes transcription instructions appel",
  },
  {
    id: "chat-mode-auto",
    tab: "agents",
    label: "Mode assistant",
    hint: "Bascule automatique Agent / Render",
    keywords: "chat assistant agent render automatique agents",
  },
  {
    id: "models",
    tab: "models",
    label: "Modèle IA",
    hint: "GPT, Grok, Claude",
    keywords: "models modèle ia gpt grok claude opus génération",
  },
  {
    id: "theme",
    tab: "general",
    label: "Theme",
    hint: "Dark, light, or system by time of day",
    keywords: "theme thème dark light clair sombre system système appearance apparence couleur color mode",
  },
  {
    id: "audio-devices",
    tab: "audio",
    label: "Audio",
    hint: "Micro, sortie et réduction du bruit",
    keywords: "audio micro microphone haut-parleur sortie écho bruit appel vocal",
  },
  {
    id: "recording-camera-preview",
    tab: "voice",
    label: "Camera preview",
    hint: "Rounded camera preview while recording",
    keywords: "voice recording enregistrement camera preview aperçu caméra salon vocal",
  },
  {
    id: "voice",
    tab: "voice",
    label: "Voice",
    hint: "Enregistrements et options de capture",
    keywords: "voice vocal salon appel enregistrement recording capture",
  },
  {
    id: "friends",
    tab: "friends",
    label: "Amis",
    hint: "Ajouter et gérer vos amis",
    keywords: "amis friends ajouter email liste messages",
  },
  {
    id: "workspaces",
    tab: "workspaces",
    label: "Workspaces",
    hint: "Changer de workspace et gérer les invitations",
    keywords: "workspaces serveurs workspace invitation rejoindre demande adhésion pivoter",
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
    hint: "IA incluse",
    keywords: "forfait pro usage abonnement ia plan",
  },
  {
    id: "billing",
    tab: "billing",
    label: "Facturation",
    hint: "Forfait actuel et prochain prélèvement",
    keywords: "billing abonnement carte prélèvement annuler forfait",
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
