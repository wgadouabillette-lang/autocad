import { create } from "zustand";

export const PRESENCE_OFFLINE_AFTER_MS = 90_000;

export interface WorkspacePresenceEntry {
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
}

interface WorkspacePresenceState {
  loadedByWorkspace: Record<string, boolean>;
  membersByWorkspace: Record<string, Record<string, WorkspacePresenceEntry>>;
  presenceTick: number;
  setWorkspacePresence: (
    workspaceId: string,
    members: Array<{
      uid: string;
      displayName: string;
      photoURL?: string;
      lastSeenMs: number;
    }>,
  ) => void;
  clearWorkspacePresence: (workspaceId: string) => void;
  isOnline: (workspaceId: string, userId: string) => boolean;
  isLoaded: (workspaceId: string) => boolean;
  tickPresence: () => void;
}

export const useWorkspacePresenceStore = create<WorkspacePresenceState>((set, get) => ({
  loadedByWorkspace: {},
  membersByWorkspace: {},
  presenceTick: 0,

  setWorkspacePresence: (workspaceId, members) => {
    const byUser: Record<string, WorkspacePresenceEntry> = {};
    for (const member of members) {
      byUser[member.uid] = {
        displayName: member.displayName,
        photoURL: member.photoURL,
        lastSeenMs: member.lastSeenMs,
      };
    }
    set((state) => {
      const prev = state.membersByWorkspace[workspaceId] ?? {};
      const prevKeys = Object.keys(prev).sort();
      const nextKeys = Object.keys(byUser).sort();
      if (
        prevKeys.length === nextKeys.length &&
        prevKeys.every((key, index) => key === nextKeys[index]) &&
        prevKeys.every((key) => {
          const before = prev[key];
          const after = byUser[key];
          return (
            before.displayName === after.displayName &&
            before.photoURL === after.photoURL &&
            before.lastSeenMs === after.lastSeenMs
          );
        })
      ) {
        return state;
      }
      return {
        loadedByWorkspace: { ...state.loadedByWorkspace, [workspaceId]: true },
        membersByWorkspace: { ...state.membersByWorkspace, [workspaceId]: byUser },
      };
    });
  },

  clearWorkspacePresence: (workspaceId) => {
    set((state) => {
      const loadedByWorkspace = { ...state.loadedByWorkspace };
      const membersByWorkspace = { ...state.membersByWorkspace };
      delete loadedByWorkspace[workspaceId];
      delete membersByWorkspace[workspaceId];
      return { loadedByWorkspace, membersByWorkspace };
    });
  },

  isLoaded: (workspaceId) => Boolean(get().loadedByWorkspace[workspaceId]),

  isOnline: (workspaceId, userId) => {
    if (!workspaceId || !userId || userId === "local") return true;
    if (!get().loadedByWorkspace[workspaceId]) return true;
    const entry = get().membersByWorkspace[workspaceId]?.[userId];
    if (!entry) return false;
    if (!entry.lastSeenMs) return false;
    return Date.now() - entry.lastSeenMs < PRESENCE_OFFLINE_AFTER_MS;
  },

  tickPresence: () => {
    set({ presenceTick: Date.now() });
  },
}));
