import { create } from "zustand";
import { sendTheaterHandRaiseNotice } from "../lib/firebase/theaterChat";
import { useAuthStore } from "./useAuthStore";
import { useStore } from "./useStore";

export interface TheaterChatAttachment {
  id: string;
  name: string;
  url: string;
  isImage: boolean;
}

export interface TheaterChatMessage {
  id: string;
  /** Identifiant stable de l'auteur (firebaseUid ou alias). Utilisé pour grouper et résoudre la PFP. */
  authorId: string;
  author: string;
  authorPhotoURL?: string | null;
  text: string;
  at: number;
  mine?: boolean;
  kind?: "text" | "hand_raise";
  attachments?: TheaterChatAttachment[];
}

interface TheaterChatState {
  messagesByWorkspace: Record<string, TheaterChatMessage[]>;
  sendMessage: (
    workspaceId: string,
    text: string,
    attachments?: TheaterChatAttachment[],
  ) => void;
  sendHandRaiseNotice: (workspaceId: string) => void;
  ingestRemoteMessage: (workspaceId: string, message: TheaterChatMessage) => void;
  replaceSyncedMessages: (workspaceId: string, synced: TheaterChatMessage[]) => void;
  /** Le chat du théâtre est éphémère : on le purge dès que la dernière personne quitte le call. */
  clearWorkspace: (workspaceId: string) => void;
  getMessages: (workspaceId: string) => TheaterChatMessage[];
}

export const useTheaterChatStore = create<TheaterChatState>((set, get) => ({
  messagesByWorkspace: {},

  sendMessage: (workspaceId, text, attachments = []) => {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;

    const auth = useAuthStore.getState();
    const userStore = useStore.getState();
    const authorId = auth.firebaseUid ?? "local";
    const authorName = userStore.userDisplayName?.trim() || "Vous";
    const authorPhotoURL = userStore.photoURL ?? null;

    const message: TheaterChatMessage = {
      id: `theater-msg-${Date.now()}`,
      authorId,
      author: authorName,
      authorPhotoURL,
      text: trimmed,
      at: Date.now(),
      mine: true,
      kind: "text",
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    set((state) => ({
      messagesByWorkspace: {
        ...state.messagesByWorkspace,
        [workspaceId]: [...(state.messagesByWorkspace[workspaceId] ?? []), message],
      },
    }));
  },

  sendHandRaiseNotice: (workspaceId) => {
    const trimmedId = workspaceId.trim();
    if (!trimmedId) return;

    const auth = useAuthStore.getState();
    const userStore = useStore.getState();
    const authorName = userStore.userDisplayName?.trim() || "Membre";
    const authorPhotoURL = userStore.photoURL ?? null;
    const authorId = auth.firebaseUid ?? "local";

    if (auth.firebaseUid) {
      void sendTheaterHandRaiseNotice(
        trimmedId,
        auth.firebaseUid,
        authorName,
        authorPhotoURL,
      ).catch((error) => {
        console.error("Theater hand raise notice failed", error);
      });
      return;
    }

    const message: TheaterChatMessage = {
      id: `theater-hand-${Date.now()}`,
      authorId,
      author: authorName,
      authorPhotoURL,
      text: "",
      at: Date.now(),
      mine: true,
      kind: "hand_raise",
    };

    set((state) => ({
      messagesByWorkspace: {
        ...state.messagesByWorkspace,
        [trimmedId]: [...(state.messagesByWorkspace[trimmedId] ?? []), message],
      },
    }));
  },

  ingestRemoteMessage: (workspaceId, message) => {
    set((state) => {
      const current = state.messagesByWorkspace[workspaceId] ?? [];
      if (current.some((m) => m.id === message.id)) return state;
      return {
        messagesByWorkspace: {
          ...state.messagesByWorkspace,
          [workspaceId]: [...current, { ...message, mine: false }],
        },
      };
    });
  },

  replaceSyncedMessages: (workspaceId, synced) => {
    set((state) => {
      const current = state.messagesByWorkspace[workspaceId] ?? [];
      const localOnly = current.filter((message) => message.id.startsWith("theater-msg-"));
      const byId = new Map<string, TheaterChatMessage>();
      for (const message of synced) byId.set(message.id, message);
      for (const message of localOnly) byId.set(message.id, message);
      const merged = [...byId.values()].sort((a, b) => a.at - b.at);
      return {
        messagesByWorkspace: {
          ...state.messagesByWorkspace,
          [workspaceId]: merged,
        },
      };
    });
  },

  clearWorkspace: (workspaceId) => {
    set((state) => {
      if (!state.messagesByWorkspace[workspaceId]) return state;
      const next = { ...state.messagesByWorkspace };
      delete next[workspaceId];
      return { messagesByWorkspace: next };
    });
  },

  getMessages: (workspaceId) => get().messagesByWorkspace[workspaceId] ?? [],
}));
