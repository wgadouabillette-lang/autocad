import { Circle, MessagesSquare, StickyNote, type LucideIcon } from "lucide-react";
import type { ChatSession } from "../store/useStore";

export type ChatSessionKind = "discussion" | "note" | "recording";

export const CHAT_SESSION_KIND_ORDER: ChatSessionKind[] = ["discussion", "note", "recording"];

export const CHAT_SESSION_KIND_META: Record<
  ChatSessionKind,
  { label: string; emptyLabel: string; Icon: LucideIcon }
> = {
  discussion: {
    label: "Discussions",
    emptyLabel: "Aucune discussion.",
    Icon: MessagesSquare,
  },
  note: {
    label: "Notes",
    emptyLabel: "Aucune note.",
    Icon: StickyNote,
  },
  recording: {
    label: "Enregistrements",
    emptyLabel: "Aucun enregistrement.",
    Icon: Circle,
  },
};

export function normalizeChatSessionKind(kind: unknown): ChatSessionKind {
  if (kind === "note" || kind === "recording" || kind === "follow-up") {
    if (kind === "follow-up") return "recording";
    return kind;
  }
  return "discussion";
}

export function groupChatSessionsByKind(sessions: ChatSession[]): Record<ChatSessionKind, ChatSession[]> {
  const grouped: Record<ChatSessionKind, ChatSession[]> = {
    discussion: [],
    note: [],
    recording: [],
  };
  for (const session of sessions) {
    grouped[normalizeChatSessionKind(session.kind)].push(session);
  }
  return grouped;
}

export function isRecordingSession(session: ChatSession | undefined): boolean {
  return normalizeChatSessionKind(session?.kind) === "recording" && !!session?.recordingId;
}
