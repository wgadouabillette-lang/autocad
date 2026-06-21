import type { LucideIcon } from "lucide-react";
import { Bot, Calendar, Circle, Mail, Sparkles } from "lucide-react";
import { CONNECTOR_ICON_FILES, connectorIconPath } from "./connectorIcons";

export type PresenceActivityId =
  | "none"
  | "calendar"
  | "gmail"
  | "grok"
  | "claude"
  | "auto"
  | "recording";

export interface PresenceActivityOption {
  id: PresenceActivityId;
  label: string;
  imageSrc?: string;
  icon?: LucideIcon;
}

export const PRESENCE_ACTIVITY_OPTIONS: PresenceActivityOption[] = [
  { id: "none", label: "Disponible", icon: Circle },
  { id: "calendar", label: "Calendrier", imageSrc: connectorIconPath(CONNECTOR_ICON_FILES.calendar) },
  { id: "gmail", label: "Gmail", imageSrc: connectorIconPath(CONNECTOR_ICON_FILES.gmail) },
  { id: "grok", label: "Grok 4.1 / xAI", imageSrc: `${import.meta.env.BASE_URL}icons/ai/xai.svg` },
  { id: "claude", label: "Claude", imageSrc: `${import.meta.env.BASE_URL}icons/ai/claude.svg` },
  { id: "auto", label: "Auto", icon: Bot },
  { id: "recording", label: "Enregistrement", icon: Sparkles },
];

/** Options sélectionnables manuellement (hors états auto : IA, média, enregistrement). */
export const PRESENCE_ACTIVITY_PICKER_OPTIONS = PRESENCE_ACTIVITY_OPTIONS.filter(
  (option) =>
    option.id !== "auto" &&
    option.id !== "none" &&
    option.id !== "recording",
);

export function isManualPresenceActivity(id: PresenceActivityId): boolean {
  return PRESENCE_ACTIVITY_PICKER_OPTIONS.some((option) => option.id === id);
}

const OPTION_BY_ID = Object.fromEntries(
  PRESENCE_ACTIVITY_OPTIONS.map((option) => [option.id, option]),
) as Record<PresenceActivityId, PresenceActivityOption>;

export function presenceActivityKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

export function getPresenceActivityOption(id: PresenceActivityId): PresenceActivityOption {
  return OPTION_BY_ID[id] ?? OPTION_BY_ID.none;
}

export function mockPresenceActivityForUser(_userId: string): PresenceActivityId {
  return "none";
}
