import { doc, getDoc } from "firebase/firestore";
import type { HandoffPayloadDoc } from "../handoffSkill";
import { db } from "./client";

function handoffRef(handoffId: string) {
  return doc(db, "handoffs", handoffId);
}

export async function loadHandoffPayload(handoffId: string): Promise<HandoffPayloadDoc | null> {
  const trimmed = handoffId.trim();
  if (!trimmed) return null;
  const snap = await getDoc(handoffRef(trimmed));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: snap.id,
    senderUid: String(data.senderUid ?? ""),
    senderName: String(data.senderName ?? ""),
    targetType: data.targetType === "group" ? "group" : "dm",
    recipientUid: typeof data.recipientUid === "string" ? data.recipientUid : undefined,
    groupId: typeof data.groupId === "string" ? data.groupId : undefined,
    kind: data.kind === "manual-note" ? "manual-note" : "ai-segment",
    title: String(data.title ?? "Handoff"),
    preview: String(data.preview ?? ""),
    messages: Array.isArray(data.messages) ? data.messages : undefined,
    noteTitle: typeof data.noteTitle === "string" ? data.noteTitle : undefined,
    noteBodyHtml: typeof data.noteBodyHtml === "string" ? data.noteBodyHtml : undefined,
    sourceSessionId: typeof data.sourceSessionId === "string" ? data.sourceSessionId : undefined,
    createdAt:
      typeof data.createdAt === "number"
        ? data.createdAt
        : data.createdAt?.seconds
          ? data.createdAt.seconds * 1000
          : Date.now(),
  };
}
