import type { ChatMessage } from "../store/useStore";

export type HandoffKind = "ai-segment" | "manual-note";
export type HandoffTargetType = "dm" | "group";

export const HANDOFF_SKILL_TEMPLATE = `/handoff`;
export const HANDOFF_MAX_MESSAGES = 20;
export const HANDOFF_MAX_NOTE_HTML_BYTES = 200_000;

export interface HandoffTarget {
  targetType: HandoffTargetType;
  recipientUid?: string;
  groupId?: string;
  displayName: string;
}

export interface HandoffPayloadDoc {
  id: string;
  senderUid: string;
  senderName: string;
  targetType: HandoffTargetType;
  recipientUid?: string;
  groupId?: string;
  kind: HandoffKind;
  title: string;
  preview: string;
  messages?: ChatMessage[];
  noteTitle?: string;
  noteBodyHtml?: string;
  sourceSessionId?: string;
  createdAt: number;
}

export interface HandoffPreviewState {
  handoffId: string;
  senderName: string;
  kind: HandoffKind;
  title: string;
  messages: ChatMessage[];
  noteTitle?: string;
  noteBodyHtml?: string;
  returnPanelMode: "agent" | "ai-notes" | "friends" | "calendar" | "theater" | "follow-up";
}

export interface CreateHandoffInput {
  kind: HandoffKind;
  targetType: HandoffTargetType;
  recipientUid?: string;
  groupId?: string;
  messageIndices?: number[];
  messages?: ChatMessage[];
  noteTitle?: string;
  noteBodyHtml?: string;
  sourceSessionId?: string;
  title?: string;
}

export interface CreateHandoffResult {
  handoffId: string;
  inboxText: string;
  title: string;
  preview: string;
}

export function isHandoffDraftReady(input: {
  selectedIndices: number[];
  target: HandoffTarget | null;
}): boolean {
  return input.selectedIndices.length > 0 && !!input.target;
}

export function isHandoffNoteReady(input: {
  title: string;
  bodyHtml: string;
  target: HandoffTarget | null;
}): boolean {
  const plain = input.bodyHtml.replace(/<[^>]+>/g, "").trim();
  return (!!input.title.trim() || !!plain) && !!input.target;
}

export function handoffInboxPreviewText(senderName: string, kind: HandoffKind): string {
  if (kind === "manual-note") {
    return `${senderName} vous a transmis une note`;
  }
  return `${senderName} vous a transmis un extrait de conversation`;
}
