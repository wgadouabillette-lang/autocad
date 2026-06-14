import type { LucideIcon } from "lucide-react";
import { Bot, Calendar, Circle, Mail, Sparkles } from "lucide-react";

export type PresenceActivityId =
  | "none"
  | "calendar"
  | "gmail"
  | "notion"
  | "figma"
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
  { id: "calendar", label: "Calendrier", imageSrc: "/icons/connectors/google-calendar.png" },
  { id: "gmail", label: "Gmail", imageSrc: "/icons/connectors/gmail.svg" },
  { id: "notion", label: "Notion", imageSrc: "/icons/connectors/notion.png" },
  { id: "figma", label: "Figma", imageSrc: "/icons/connectors/figma.svg" },
  { id: "grok", label: "Grok 4.1 / xAI", imageSrc: "/icons/ai/xai.svg" },
  { id: "claude", label: "Claude", imageSrc: "/icons/ai/claude.svg" },
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
