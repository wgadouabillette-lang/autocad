import { normalizeChatSessionKind } from "./chatSessionKinds";
import type { ChatSession } from "../store/useStore";

export function formatShortChatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Hier";
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function mergeChatHistorySessions(
  openChatTabs: ChatSession[],
  chatSessions: ChatSession[],
): ChatSession[] {
  const byId = new Map<string, ChatSession>();
  for (const session of chatSessions) byId.set(session.id, session);
  for (const session of openChatTabs) byId.set(session.id, session);
  return [...byId.values()]
    .filter(
      (session) =>
        normalizeChatSessionKind(session.kind) === "recording" ||
        session.messages.some((message) => message.role === "user" || message.role === "assistant"),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
