import { create } from "zustand";
import { usePeopleStore } from "./usePeopleStore";

interface MiniChatState {
  open: boolean;
  threadId: string | null;
  personName: string;
  openForColleague: (workspaceId: string, personId: string, personName: string) => void;
  close: () => void;
}

export const useMiniChatStore = create<MiniChatState>((set) => ({
  open: false,
  threadId: null,
  personName: "",

  openForColleague: (workspaceId, personId, personName) => {
    usePeopleStore
      .getState()
      .openWorkspaceMemberConversation(workspaceId, personId, personName);
    set({ open: false, threadId: null, personName: "" });
  },

  close: () => set({ open: false, threadId: null, personName: "" }),
}));
