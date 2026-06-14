export type AiModel =
  | "auto"
  | "gpt-4.1-nano"
  | "gpt-4o-mini"
  | "grok-mini"
  | "grok"
  | "claude-opus-4-7"
  | "claude-opus-4-8";

export type AiModelSpeed = "fast" | "medium" | "reasoning";

export type AiModelIconKey = "openai" | "grok" | "claude";

/** Modèle chat économique utilisé en mode Auto (aligné sur FORMA_AUTO_CHAT_MODEL). */
export const AUTO_CHAT_MODEL_NAME = "GPT 4.1 nano";

export interface AiModelDef {
  id: AiModel;
  label: string;
  short: string;
  speed: AiModelSpeed;
  icon?: AiModelIconKey;
}

export const AI_MODEL_SPEED_LABELS: Record<AiModelSpeed, string> = {
  fast: "fast",
  medium: "medium",
  reasoning: "reasoning",
};

/** Taille fixe des logos modèle (alignée sur Claude). */
export const MODEL_SELECTOR_ICON_CLASS = "h-4 w-4";

/** Largeur fixe colonne vitesse — évite le décalage Auto ↔ modèle avec logo. */
export const MODEL_SELECTOR_SPEED_CLASS = "w-[3.35rem] shrink-0 text-left";

/** Espacement uniforme entre icône, nom et vitesse (8px). */
export const MODEL_SELECTOR_GAP_CLASS = "gap-2";

/** Gap texte → chevron dans le bouton composeur (8px). */
export const MODEL_SELECTOR_CHEVRON_GAP_CLASS = "gap-2";

export const AI_MODELS: AiModelDef[] = [
  {
    id: "auto",
    label: "Auto",
    short: "Auto",
    speed: "fast",
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT 4.1 nano",
    short: "GPT 4.1 nano",
    speed: "fast",
    icon: "openai",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT 4o mini",
    short: "GPT 4o mini",
    speed: "fast",
    icon: "openai",
  },
  {
    id: "grok-mini",
    label: "Grok 3 Mini",
    short: "Grok 3 Mini",
    speed: "fast",
    icon: "grok",
  },
  {
    id: "grok",
    label: "Grok 4.1",
    short: "Grok 4.1",
    speed: "fast",
    icon: "grok",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    short: "Opus 4.7",
    speed: "medium",
    icon: "claude",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    short: "Opus 4.8",
    speed: "reasoning",
    icon: "claude",
  },
];

/** Modèles affichés dans Paramètres → Models (sans Auto). */
export const SETTINGS_AI_MODELS = AI_MODELS.filter((m) => m.id !== "auto");

const AI_MODEL_IDS = new Set<AiModel>(AI_MODELS.map((m) => m.id));

export function isValidAiModel(value: unknown): value is AiModel {
  return typeof value === "string" && AI_MODEL_IDS.has(value as AiModel);
}

export interface AiModelDisplay {
  name: string;
  speed: AiModelSpeed;
  icon?: AiModelIconKey;
  /** Bouton composeur Auto : texte seul, sans vitesse ni logo. */
  compact?: boolean;
  /** Masque la colonne vitesse (ex. Auto dans le bouton — chevron à 8px du texte). */
  hideSpeedSlot?: boolean;
}

export function aiModelDef(id: AiModel): AiModelDef {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];
}

export function aiModelLabel(id: AiModel) {
  return aiModelDef(id).short;
}

function toModelDisplay(model: AiModelDef): AiModelDisplay {
  return {
    name: model.short,
    speed: model.speed,
    ...(model.icon ? { icon: model.icon } : {}),
  };
}

/** Affichage du bouton composeur (Auto → libellé seul). */
export function composerModelDisplay(id: AiModel): AiModelDisplay {
  if (id === "auto") {
    return { name: "Auto", speed: "fast", compact: true, hideSpeedSlot: true };
  }
  return toModelDisplay(aiModelDef(id));
}

/** Affichage d’une option dans le menu (nom court + vitesse + logo optionnel). */
export function modelOptionDisplay(id: AiModel): AiModelDisplay {
  if (id === "auto") {
    return { name: "Auto", speed: "fast", compact: true };
  }
  return toModelDisplay(aiModelDef(id));
}
