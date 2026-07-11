import { create } from "zustand";
import { usePeopleStore } from "./usePeopleStore";

export const PRESENCE_OFFLINE_AFTER_MS = 90_000;

export interface WorkspacePresenceVoice {
  inPrivateCall: boolean;
  openChannelId: string | null;
  speaking?: boolean;
}

export interface WorkspacePresenceEntry {
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
  online: boolean;
  voice: WorkspacePresenceVoice;
}

export interface WorkspaceRosterEntry {
  displayName: string;
  photoURL?: string;
}

interface PresenceOverlayMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
  online?: boolean;
  voice?: WorkspacePresenceVoice;
}

function emptyVoice(): WorkspacePresenceVoice {
  return { inPrivateCall: false, openChannelId: null, speaking: false };
}

function mergeRosterAndPresence(
  roster: Record<string, WorkspaceRosterEntry>,
  presence: PresenceOverlayMember[],
): Record<string, WorkspacePresenceEntry> {
  const byUser: Record<string, WorkspacePresenceEntry> = {};

  for (const [uid, entry] of Object.entries(roster)) {
    byUser[uid] = {
      displayName: entry.displayName,
      photoURL: entry.photoURL,
      lastSeenMs: 0,
      online: false,
      voice: emptyVoice(),
    };
  }

  for (const member of presence) {
    const existing = byUser[member.uid];
    byUser[member.uid] = {
      displayName: member.displayName.trim() || existing?.displayName || "Membre",
      photoURL: member.photoURL ?? existing?.photoURL,
      lastSeenMs: member.lastSeenMs,
      online: member.online !== false,
      voice: member.voice ?? existing?.voice ?? emptyVoice(),
    };
  }

  return byUser;
}

function presenceEntriesEqual(
  prev: Record<string, WorkspacePresenceEntry>,
  next: Record<string, WorkspacePresenceEntry>,
): boolean {
  const prevKeys = Object.keys(prev).sort();
  const nextKeys = Object.keys(next).sort();
  if (prevKeys.length !== nextKeys.length) return false;
  if (!prevKeys.every((key, index) => key === nextKeys[index])) return false;
  return prevKeys.every((key) => {
    const before = prev[key];
    const after = next[key];
    return (
      before.displayName === after.displayName &&
      before.photoURL === after.photoURL &&
      before.lastSeenMs === after.lastSeenMs &&
      before.online === after.online &&
      before.voice.inPrivateCall === after.voice.inPrivateCall &&
      before.voice.openChannelId === after.voice.openChannelId &&
      before.voice.speaking === after.voice.speaking
    );
  });
}

interface WorkspacePresenceState {
  loadedByWorkspace: Record<string, boolean>;
  rosterByWorkspace: Record<string, Record<string, WorkspaceRosterEntry>>;
  presenceOverlayByWorkspace: Record<string, PresenceOverlayMember[]>;
  membersByWorkspace: Record<string, Record<string, WorkspacePresenceEntry>>;
  presenceTick: number;
  setWorkspaceRoster: (
    workspaceId: string,
    members: Array<{ uid: string; displayName: string; photoURL?: string }>,
  ) => void;
  setWorkspacePresence: (
    workspaceId: string,
    members: Array<{
      uid: string;
      displayName: string;
      photoURL?: string;
      lastSeenMs: number;
      online?: boolean;
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

function rebuildWorkspaceMembers(
  state: Pick<
    WorkspacePresenceState,
    "rosterByWorkspace" | "presenceOverlayByWorkspace" | "membersByWorkspace" | "loadedByWorkspace"
  >,
  workspaceId: string,
  markLoaded: boolean,
): Partial<WorkspacePresenceState> | null {
  const roster = state.rosterByWorkspace[workspaceId] ?? {};
  const presence = state.presenceOverlayByWorkspace[workspaceId] ?? [];
  const byUser = mergeRosterAndPresence(roster, presence);
  const prev = state.membersByWorkspace[workspaceId] ?? {};
  const alreadyLoaded = Boolean(state.loadedByWorkspace[workspaceId]);
  if (presenceEntriesEqual(prev, byUser) && (!markLoaded || alreadyLoaded)) {
    return null;
  }
  return {
    loadedByWorkspace: markLoaded
      ? { ...state.loadedByWorkspace, [workspaceId]: true }
      : state.loadedByWorkspace,
    membersByWorkspace: { ...state.membersByWorkspace, [workspaceId]: byUser },
  };
}

export const useWorkspacePresenceStore = create<WorkspacePresenceState>((set, get) => ({
  loadedByWorkspace: {},
  rosterByWorkspace: {},
  presenceOverlayByWorkspace: {},
  membersByWorkspace: {},
  presenceTick: 0,

  setWorkspaceRoster: (workspaceId, members) => {
    const roster: Record<string, WorkspaceRosterEntry> = {};
    for (const member of members) {
      if (!member.uid) continue;
      roster[member.uid] = {
        displayName: member.displayName.trim() || "Membre",
        photoURL: member.photoURL,
      };
      if (member.photoURL?.trim()) {
        usePeopleStore.getState().cachePersonPhoto(member.uid, member.photoURL);
      }
    }
    set((state) => {
      const nextState = {
        ...state,
        rosterByWorkspace: { ...state.rosterByWorkspace, [workspaceId]: roster },
      };
      const rebuilt = rebuildWorkspaceMembers(nextState, workspaceId, true);
      if (!rebuilt) {
        return {
          rosterByWorkspace: nextState.rosterByWorkspace,
        };
      }
      return {
        rosterByWorkspace: nextState.rosterByWorkspace,
        ...rebuilt,
      };
    });
  },

  setWorkspacePresence: (workspaceId, members) => {
    for (const member of members) {
      if (member.photoURL?.trim()) {
        usePeopleStore.getState().cachePersonPhoto(member.uid, member.photoURL);
      }
    }
    set((state) => {
      const nextState = {
        ...state,
        presenceOverlayByWorkspace: {
          ...state.presenceOverlayByWorkspace,
          [workspaceId]: members,
        },
      };
      const rebuilt = rebuildWorkspaceMembers(nextState, workspaceId, true);
      if (!rebuilt) {
        return {
          presenceOverlayByWorkspace: nextState.presenceOverlayByWorkspace,
        };
      }
      return {
        presenceOverlayByWorkspace: nextState.presenceOverlayByWorkspace,
        ...rebuilt,
      };
    });
  },

  clearWorkspacePresence: (workspaceId) => {
    set((state) => {
      const loadedByWorkspace = { ...state.loadedByWorkspace };
      const rosterByWorkspace = { ...state.rosterByWorkspace };
      const presenceOverlayByWorkspace = { ...state.presenceOverlayByWorkspace };
      const membersByWorkspace = { ...state.membersByWorkspace };
      delete loadedByWorkspace[workspaceId];
      delete rosterByWorkspace[workspaceId];
      delete presenceOverlayByWorkspace[workspaceId];
      delete membersByWorkspace[workspaceId];
      return {
        loadedByWorkspace,
        rosterByWorkspace,
        presenceOverlayByWorkspace,
        membersByWorkspace,
      };
    });
  },

  isLoaded: (workspaceId) => Boolean(get().loadedByWorkspace[workspaceId]),

  isOnline: (workspaceId, userId) => {
    if (!workspaceId || !userId || userId === "local") return true;
    if (!get().loadedByWorkspace[workspaceId]) return true;
    const entry = get().membersByWorkspace[workspaceId]?.[userId];
    if (!entry) return false;
    if (entry.online === false) return false;
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
