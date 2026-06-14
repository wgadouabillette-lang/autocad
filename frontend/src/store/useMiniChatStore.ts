import { create } from "zustand";
import { usePeopleStore } from "./usePeopleStore";
import { useStore } from "./useStore";

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
    const threadId = usePeopleStore
      .getState()
      .ensureColleagueThread(workspaceId, personId, personName);
    usePeopleStore.getState().markThreadRead(threadId);
    useStore.getState().switchChatPanelMode("friends");
    usePeopleStore.getState().setActiveFriendThread(threadId);
    set({ open: false, threadId: null, personName: "" });
  },

  close: () => set({ open: false, threadId: null, personName: "" }),
}));
