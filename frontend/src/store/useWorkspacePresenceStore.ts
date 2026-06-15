import { create } from "zustand";

export const PRESENCE_OFFLINE_AFTER_MS = 90_000;

export interface WorkspacePresenceVoice {
  inPrivateCall: boolean;
  openChannelId: string | null;
}

export interface WorkspacePresenceEntry {
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
  voice: WorkspacePresenceVoice;
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
      voice?: WorkspacePresenceVoice;
    }>,
  ) => void;
  clearWorkspacePresence: (workspaceId: string) => void;
  isOnline: (workspaceId: string, userId: string) => boolean;
  isInPrivateCall: (workspaceId: string, userId: string) => boolean;
  peerUidsInOpenChannel: (
    workspaceId: string,
    channelId: string,
    localFirebaseUid: string,
  ) => string[];
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
        voice: member.voice ?? { inPrivateCall: false, openChannelId: null },
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
            before.lastSeenMs === after.lastSeenMs &&
            before.voice.inPrivateCall === after.voice.inPrivateCall &&
            before.voice.openChannelId === after.voice.openChannelId
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

  isInPrivateCall: (workspaceId, userId) => {
    if (!workspaceId || !userId || userId === "local") return false;
    return get().membersByWorkspace[workspaceId]?.[userId]?.voice.inPrivateCall === true;
  },

  peerUidsInOpenChannel: (workspaceId, channelId, localFirebaseUid) => {
    if (!workspaceId || !channelId) return [];
    const members = get().membersByWorkspace[workspaceId] ?? {};
    return Object.entries(members)
      .filter(
        ([uid, entry]) =>
          uid !== localFirebaseUid &&
          entry.voice.openChannelId === channelId,
      )
      .map(([uid]) => uid);
  },

  tickPresence: () => {
    set({ presenceTick: Date.now() });
  },
}));
