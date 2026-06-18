import { create } from "zustand";
import { api } from "../lib/api";
import { friendChatId, sendFriendChatMessage } from "../lib/firebase/friendChats";
import { sendGroupChatMessage } from "../lib/firebase/groupChats";
import { loadHandoffPayload } from "../lib/firebase/handoffs";
import type {
  HandoffPreviewState,
  HandoffTarget,
} from "../lib/handoffSkill";
import type { ChatMessage } from "./useStore";
import { useStore } from "./useStore";
import { auth } from "../lib/firebase/client";
import { usePeopleStore } from "./usePeopleStore";

interface HandoffStore {
  selectionMode: boolean;
  selectedIndices: Set<number>;
  target: HandoffTarget | null;
  submitting: boolean;
  error: string | null;
  preview: HandoffPreviewState | null;
  noteHandoffOpen: boolean;
  noteHandoffTitle: string;
  noteHandoffBodyHtml: string;

  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  toggleMessageIndex: (index: number) => void;
  setTarget: (target: HandoffTarget | null) => void;
  openNoteHandoff: (title: string, bodyHtml: string) => void;
  closeNoteHandoff: () => void;
  submitSegmentHandoff: (messages: ChatMessage[], sourceSessionId?: string) => Promise<void>;
  submitNoteHandoff: () => Promise<void>;
  openPreview: (handoffId: string) => Promise<void>;
  closePreview: () => void;
}

async function deliverHandoffInboxMessage(
  target: HandoffTarget,
  payload: { handoffId: string; inboxText: string; title: string; preview: string },
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Connectez-vous pour envoyer un handoff.");

  const myName = useStore.getState().userDisplayName || "Vous";
  const extras = {
    kind: "handoff" as const,
    handoffId: payload.handoffId,
    handoffTitle: payload.title,
    handoffPreview: payload.preview,
  };

  if (target.targetType === "group" && target.groupId) {
    const thread = usePeopleStore
      .getState()
      .groupThreads.find((t) => t.personId === target.groupId);
    const participants = thread?.memberIds ?? [user.uid];
    await sendGroupChatMessage(
      target.groupId,
      user.uid,
      myName,
      participants,
      payload.inboxText,
      extras,
    );
    return;
  }

  if (!target.recipientUid) throw new Error("Destinataire invalide.");
  const chatId = friendChatId(user.uid, target.recipientUid);
  const participants = [user.uid, target.recipientUid].sort();
  await sendFriendChatMessage(
    chatId,
    user.uid,
    myName,
    participants,
    payload.inboxText,
    extras,
  );
}

export const useHandoffStore = create<HandoffStore>((set, get) => ({
  selectionMode: false,
  selectedIndices: new Set(),
  target: null,
  submitting: false,
  error: null,
  preview: null,
  noteHandoffOpen: false,
  noteHandoffTitle: "",
  noteHandoffBodyHtml: "",

  enterSelectionMode: () =>
    set({
      selectionMode: true,
      selectedIndices: new Set(),
      target: null,
      error: null,
    }),

  exitSelectionMode: () =>
    set({
      selectionMode: false,
      selectedIndices: new Set(),
      target: null,
      error: null,
    }),

  toggleMessageIndex: (index) =>
    set((state) => {
      const next = new Set(state.selectedIndices);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { selectedIndices: next };
    }),

  setTarget: (target) => set({ target, error: null }),

  openNoteHandoff: (title, bodyHtml) =>
    set({
      noteHandoffOpen: true,
      noteHandoffTitle: title,
      noteHandoffBodyHtml: bodyHtml,
      target: null,
      error: null,
    }),

  closeNoteHandoff: () =>
    set({
      noteHandoffOpen: false,
      noteHandoffTitle: "",
      noteHandoffBodyHtml: "",
      target: null,
      error: null,
    }),

  submitSegmentHandoff: async (messages, sourceSessionId) => {
    const { selectedIndices, target } = get();
    if (!target || selectedIndices.size === 0) return;

    set({ submitting: true, error: null });
    try {
      const indices = [...selectedIndices].sort((a, b) => a - b);
      const result = await api.createHandoff({
        kind: "ai-segment",
        targetType: target.targetType,
        recipientUid: target.recipientUid,
        groupId: target.groupId,
        messageIndices: indices,
        messages: messages.map((m) => ({ role: m.role, text: m.text })),
        sourceSessionId,
      });
      await deliverHandoffInboxMessage(target, result);
      get().exitSelectionMode();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Impossible d'envoyer le handoff.",
      });
    } finally {
      set({ submitting: false });
    }
  },

  submitNoteHandoff: async () => {
    const { target, noteHandoffTitle, noteHandoffBodyHtml } = get();
    if (!target) return;

    set({ submitting: true, error: null });
    try {
      const result = await api.createHandoff({
        kind: "manual-note",
        targetType: target.targetType,
        recipientUid: target.recipientUid,
        groupId: target.groupId,
        noteTitle: noteHandoffTitle,
        noteBodyHtml: noteHandoffBodyHtml,
      });
      await deliverHandoffInboxMessage(target, result);
      get().closeNoteHandoff();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Impossible d'envoyer le handoff.",
      });
    } finally {
      set({ submitting: false });
    }
  },

  openPreview: async (handoffId) => {
    const store = useStore.getState();
    const returnPanelMode = store.chatPanelMode;
    set({ error: null });

    try {
      const doc = await loadHandoffPayload(handoffId);
      if (!doc) throw new Error("Handoff introuvable ou expiré.");

      const messages: ChatMessage[] =
        doc.kind === "ai-segment" && doc.messages?.length
          ? doc.messages.map((m) => ({
              role: (m.role as ChatMessage["role"]) || "user",
              text: m.text,
            }))
          : [];

      set({
        preview: {
          handoffId,
          senderName: doc.senderName,
          kind: doc.kind,
          title: doc.title,
          messages,
          noteTitle: doc.noteTitle,
          noteBodyHtml: doc.noteBodyHtml,
          returnPanelMode,
        },
      });

      store.switchChatPanelMode("agent");
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Impossible d'ouvrir le handoff.",
      });
    }
  },

  closePreview: () => {
    const preview = get().preview;
    if (preview) {
      useStore.getState().switchChatPanelMode(preview.returnPanelMode);
    }
    set({ preview: null });
  },
}));
