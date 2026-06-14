import { create } from "zustand";

export interface TheaterChatMessage {
  id: string;
  author: string;
  text: string;
  at: number;
  mine?: boolean;
}

interface TheaterChatState {
  messagesByWorkspace: Record<string, TheaterChatMessage[]>;
  sendMessage: (workspaceId: string, text: string) => void;
  getMessages: (workspaceId: string) => TheaterChatMessage[];
}

export const useTheaterChatStore = create<TheaterChatState>((set, get) => ({
  messagesByWorkspace: {},

  sendMessage: (workspaceId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const message: TheaterChatMessage = {
      id: `theater-msg-${Date.now()}`,
      author: "Vous",
      text: trimmed,
      at: Date.now(),
      mine: true,
    };

    set((state) => ({
      messagesByWorkspace: {
        ...state.messagesByWorkspace,
        [workspaceId]: [...(state.messagesByWorkspace[workspaceId] ?? []), message],
      },
    }));
  },

  getMessages: (workspaceId) => get().messagesByWorkspace[workspaceId] ?? [],
}));
