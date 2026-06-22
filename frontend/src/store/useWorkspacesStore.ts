import { create } from "zustand";
import {
  LOCAL_USER_ID,
  defaultPersonalWorkspaceName,
  isLegacyPublicWorkspaceId,
  normalizeWorkspaceId,
  pickWorkspaceAccent,
  type ServerMembership,
  type ServerRole,
  type Workspace,
} from "../lib/workspaces";
import { generateWorkspaceInviteId } from "../lib/workspaceInvite";
import { auth } from "../lib/firebase/client";
import {
  fetchJoinRequestForUser,
  fetchSharedWorkspace,
  deleteSharedWorkspace,
  grantWorkspaceMember,
  publishSharedWorkspace,
  requestWorkspaceJoin,
  respondWorkspaceJoinRequest,
  type WorkspaceJoinRequestDoc,
} from "../lib/firebase/workspaceRegistry";
import { parseWorkspaceInviteInput } from "../lib/workspaceInvite";
import {
  canCreateOwnedWorkspace,
  FREE_OWNED_WORKSPACE_LIMIT,
} from "../lib/subscriptionPlans";
import { resolveActiveWorkspaceId } from "../lib/lastActiveWorkspace";
import { useCallsStore } from "./useCallsStore";
import { useStore } from "./useStore";

const STORAGE_KEY = "forma-server-memberships";
const PENDING_JOINS_KEY = "forma-pending-join-requests";

function currentMembershipUserId(): string {
  return auth.currentUser?.uid ?? LOCAL_USER_ID;
}

interface PersistedState {
  customServers: Workspace[];
  memberships: ServerMembership[];
}

interface WorkspacesState extends PersistedState {
  hydrated: boolean;
  pendingJoinRequests: string[];
  incomingJoinRequests: WorkspaceJoinRequestDoc[];
  pendingInviteWorkspaceId: string | null;
  hydrate: () => void;
  setPendingInviteWorkspaceId: (workspaceId: string | null) => void;
  consumePendingInviteWorkspaceId: () => string | null;
  addPendingJoinRequest: (workspaceId: string) => void;
  removePendingJoinRequest: (workspaceId: string) => void;
  findWorkspace: (id: string) => Workspace | undefined;
  joinedWorkspaces: (userId?: string) => Workspace[];
  membershipIn: (workspaceId: string, userId?: string) => ServerMembership | undefined;
  roleIn: (workspaceId: string, userId?: string) => ServerRole | null;
  isWorkspaceOwner: (workspaceId: string, userId?: string) => boolean;
  ownedWorkspaceCount: (userId?: string) => number;
  canUserCreateWorkspace: (userId?: string) => boolean;
  createWorkspace: (name: string, ownerName: string, userId?: string) => string;
  createPersonalWorkspace: (ownerName: string, userId?: string) => string;
  addRemoteWorkspace: (workspace: Workspace, userId?: string) => boolean;
  updateWorkspace: (
    workspaceId: string,
    patch: Partial<Pick<Workspace, "name" | "accent" | "iconURL">>,
    userId?: string,
  ) => boolean;
  requestJoinWorkspace: (
    workspaceId: string,
    profile: { uid: string; displayName: string; email: string },
  ) => Promise<void>;
  respondJoinRequest: (
    workspaceId: string,
    requesterUid: string,
    accept: boolean,
    requester?: Pick<WorkspaceJoinRequestDoc, "requesterName" | "requesterEmail">,
  ) => Promise<void>;
  reconcilePendingJoinRequests: (userId: string) => Promise<void>;
  leaveWorkspace: (workspaceId: string, userId?: string) => void;
  deleteWorkspace: (workspaceId: string, userId?: string) => Promise<void>;
  resetLocalMemberships: () => void;
  stripLegacyPublicWorkspaces: () => void;
}

function readPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { customServers: [], memberships: [] };
    const data = JSON.parse(raw) as Partial<PersistedState>;
    return sanitizePersisted({
      customServers: Array.isArray(data.customServers) ? data.customServers : [],
      memberships: Array.isArray(data.memberships) ? data.memberships : [],
    });
  } catch {
    return { customServers: [], memberships: [] };
  }
}

function sanitizePersisted(state: PersistedState): PersistedState {
  const customServers = state.customServers.filter(
    (server) => !isLegacyPublicWorkspaceId(server.id),
  );
  const memberships = state.memberships.filter(
    (entry) => !isLegacyPublicWorkspaceId(entry.workspaceId),
  );
  return { customServers, memberships };
}

function writePendingJoinRequests(ids: string[]) {
  localStorage.setItem(PENDING_JOINS_KEY, JSON.stringify(ids));
}

function readPendingJoinRequests(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_JOINS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function writePersisted(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePersisted(state)));
}

function normalizeCustomServers(servers: Workspace[]): Workspace[] {
  return servers.map((server, index) => ({
    id: server.id,
    name: server.name,
    accent: server.accent ?? pickWorkspaceAccent(index),
    ...(server.iconURL ? { iconURL: server.iconURL } : {}),
    ownerId: server.ownerId ?? LOCAL_USER_ID,
    ownerName: server.ownerName ?? "Vous",
    createdAt: server.createdAt ?? Date.now(),
  }));
}

function normalizeMemberships(memberships: ServerMembership[]): ServerMembership[] {
  const seen = new Set<string>();
  const normalized: ServerMembership[] = [];
  for (const entry of memberships) {
    const workspaceId = normalizeWorkspaceId(entry.workspaceId);
    if (isLegacyPublicWorkspaceId(workspaceId)) continue;
    const key = `${entry.userId}:${workspaceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ ...entry, workspaceId });
  }
  return normalized;
}

function ensureJoinedWorkspaceRooms(joined: Workspace[]) {
  const ensureRoom = useCallsStore.getState().ensureRoom;
  for (const workspace of joined) {
    ensureRoom(workspace.id);
  }
}

function syncActiveWorkspace(joined: Workspace[], userId?: string) {
  if (joined.length === 0) return;
  ensureJoinedWorkspaceRooms(joined);
  const memberUid = userId ?? currentMembershipUserId();
  const target = resolveActiveWorkspaceId(
    joined.map((workspace) => workspace.id),
    { currentId: useStore.getState().activeRoomId, userId: memberUid },
  );
  if (!target) return;
  if (target !== useStore.getState().activeRoomId) {
    useStore.getState().setActiveRoom(target);
  } else {
    useCallsStore.getState().ensureRoom(target);
  }
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  customServers: [],
  memberships: [],
  hydrated: false,
  pendingJoinRequests: [],
  incomingJoinRequests: [],
  pendingInviteWorkspaceId: null,

  setPendingInviteWorkspaceId: (workspaceId) => {
    set({ pendingInviteWorkspaceId: workspaceId?.trim().toLowerCase() || null });
  },

  consumePendingInviteWorkspaceId: () => {
    const value = get().pendingInviteWorkspaceId;
    if (value) set({ pendingInviteWorkspaceId: null });
    return value;
  },

  hydrate: () => {
    if (get().hydrated) return;
    const persisted = sanitizePersisted(readPersisted());
    const customServers = normalizeCustomServers(persisted.customServers);
    const memberships = normalizeMemberships(persisted.memberships);
    const pendingJoinRequests = readPendingJoinRequests();

    writePersisted({ customServers, memberships });
    set({
      customServers,
      memberships,
      pendingJoinRequests,
      hydrated: true,
    });
    get().stripLegacyPublicWorkspaces();
    const memberUid = currentMembershipUserId();
    if (get().joinedWorkspaces(memberUid).length === 0 && memberUid === LOCAL_USER_ID) {
      const ownerName = useStore.getState().userDisplayName;
      get().createPersonalWorkspace(ownerName, LOCAL_USER_ID);
    }
    syncActiveWorkspace(get().joinedWorkspaces(memberUid));
  },

  addPendingJoinRequest: (workspaceId) => {
    const normalized = normalizeWorkspaceId(workspaceId.trim());
    if (!normalized) return;
    set((state) => {
      if (state.pendingJoinRequests.includes(normalized)) return state;
      const pendingJoinRequests = [...state.pendingJoinRequests, normalized];
      writePendingJoinRequests(pendingJoinRequests);
      return { pendingJoinRequests };
    });
  },

  removePendingJoinRequest: (workspaceId) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    set((state) => {
      const pendingJoinRequests = state.pendingJoinRequests.filter((id) => id !== normalized);
      writePendingJoinRequests(pendingJoinRequests);
      return { pendingJoinRequests };
    });
  },

  findWorkspace: (id) => {
    const normalized = normalizeWorkspaceId(id);
    return get().customServers.find((server) => server.id === normalized);
  },

  joinedWorkspaces: (userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    const joinedIds = new Set(
      get()
        .memberships.filter((entry) => entry.userId === memberUid)
        .map((entry) => entry.workspaceId),
    );
    return get().customServers.filter((server) => joinedIds.has(server.id));
  },

  membershipIn: (workspaceId, userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    const normalized = normalizeWorkspaceId(workspaceId);
    return get().memberships.find(
      (entry) => entry.userId === memberUid && entry.workspaceId === normalized,
    );
  },

  roleIn: (workspaceId, userId) => {
    return get().membershipIn(workspaceId, userId)?.role ?? null;
  },

  isWorkspaceOwner: (workspaceId, userId) => {
    return get().roleIn(workspaceId, userId) === "owner";
  },

  ownedWorkspaceCount: (userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    return get().memberships.filter(
      (entry) => entry.userId === memberUid && entry.role === "owner",
    ).length;
  },

  canUserCreateWorkspace: (userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    const ownedCount = get().ownedWorkspaceCount(memberUid);
    const { subscriptionPlan, billingManaged } = useStore.getState();
    return canCreateOwnedWorkspace(ownedCount, subscriptionPlan, billingManaged);
  },

  createWorkspace: (name, ownerName, userId = LOCAL_USER_ID) => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Le nom du serveur est requis.");
    }
    if (!get().canUserCreateWorkspace(userId)) {
      throw new Error(
        `Limite de ${FREE_OWNED_WORKSPACE_LIMIT} serveurs personnels atteinte. Passez à Pro pour en créer davantage.`,
      );
    }
    const existing = new Set(get().customServers.map((server) => server.id));
    let id = generateWorkspaceInviteId();
    while (existing.has(id)) {
      id = generateWorkspaceInviteId();
    }

    const server: Workspace = {
      id,
      name: trimmed,
      accent: pickWorkspaceAccent(get().customServers.length),
      ownerId: userId,
      ownerName: ownerName.trim() || "Vous",
      createdAt: Date.now(),
    };
    const membership: ServerMembership = {
      workspaceId: id,
      userId,
      role: "owner",
      joinedAt: Date.now(),
    };

    set((state) => {
      const customServers = [...state.customServers, server];
      const memberships = [...state.memberships, membership];
      writePersisted({ customServers, memberships });
      return { customServers, memberships };
    });

    if (auth.currentUser) {
      void publishSharedWorkspace(server).catch(() => {
        // Le workspace reste utilisable localement même si l'enregistrement cloud échoue.
      });
    }

    return id;
  },

  createPersonalWorkspace: (ownerName, userId = LOCAL_USER_ID) => {
    return get().createWorkspace(defaultPersonalWorkspaceName(ownerName), ownerName, userId);
  },

  addRemoteWorkspace: (workspace, userId = LOCAL_USER_ID) => {
    const normalized = normalizeWorkspaceId(workspace.id);
    if (get().membershipIn(normalized, userId)) return false;

    const membership: ServerMembership = {
      workspaceId: normalized,
      userId,
      role: workspace.ownerId === userId ? "owner" : "member",
      joinedAt: Date.now(),
    };

    set((state) => {
      const hasServer = state.customServers.some((server) => server.id === normalized);
      const customServers = hasServer
        ? state.customServers
        : [...state.customServers, { ...workspace, id: normalized }];
      const memberships = [...state.memberships, membership];
      writePersisted({ customServers, memberships });
      return { customServers, memberships };
    });

    ensureJoinedWorkspaceRooms([{ ...workspace, id: normalized }]);
    return true;
  },

  updateWorkspace: (workspaceId, patch, userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    const normalized = normalizeWorkspaceId(workspaceId);
    if (get().roleIn(normalized, memberUid) !== "owner") return false;

    const trimmedName = patch.name?.trim();
    const nextPatch: Partial<Pick<Workspace, "name" | "accent" | "iconURL">> = {
      ...patch,
      ...(trimmedName ? { name: trimmedName } : {}),
    };

    set((state) => {
      const inCustom = state.customServers.some((server) => server.id === normalized);
      if (!inCustom) return state;

      const customServers = state.customServers.map((server) =>
        server.id === normalized ? { ...server, ...nextPatch } : server,
      );
      writePersisted({ customServers, memberships: state.memberships });
      const updated = customServers.find((server) => server.id === normalized);
      if (updated) {
        void publishSharedWorkspace(updated).catch(() => {});
      }
      return { customServers };
    });
    return true;
  },

  requestJoinWorkspace: async (workspaceId, profile) => {
    const normalized = parseWorkspaceInviteInput(workspaceId);
    if (!normalized) {
      throw new Error("Indiquez l'identifiant du workspace.");
    }
    const memberUid = profile.uid || LOCAL_USER_ID;
    if (get().membershipIn(normalized, memberUid)) {
      throw new Error("Vous faites déjà partie de ce workspace.");
    }
    await requestWorkspaceJoin(normalized, profile);
    get().addPendingJoinRequest(normalized);
  },

  respondJoinRequest: async (workspaceId, requesterUid, accept, requester) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    const ownerUid = currentMembershipUserId();
    if (!get().isWorkspaceOwner(normalized, ownerUid)) {
      throw new Error("Seul le propriétaire peut répondre aux demandes.");
    }
    await respondWorkspaceJoinRequest(normalized, requesterUid, accept);
    if (accept) {
      await grantWorkspaceMember(normalized, {
        uid: requesterUid,
        displayName: requester?.requesterName?.trim() || "Membre",
        email: requester?.requesterEmail?.trim().toLowerCase() || "",
      });
    }
  },

  reconcilePendingJoinRequests: async (userId) => {
    const pending = get().pendingJoinRequests;
    if (!userId || pending.length === 0) return;

    for (const workspaceId of pending) {
      const request = await fetchJoinRequestForUser(workspaceId, userId);
      if (!request) continue;
      if (request.status === "accepted") {
        const added = await acceptSharedWorkspaceJoin(workspaceId, userId);
        get().removePendingJoinRequest(workspaceId);
        if (added) {
          const { useAuthStore } = await import("./useAuthStore");
          await useAuthStore.getState().syncWorkspacesToCloud();
        }
      } else if (request.status === "declined") {
        get().removePendingJoinRequest(workspaceId);
      }
    }
  },

  leaveWorkspace: (workspaceId, userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    const normalized = normalizeWorkspaceId(workspaceId);
    const membership = get().membershipIn(normalized, memberUid);
    if (!membership || membership.role === "owner") return;

    set((state) => {
      const memberships = state.memberships.filter(
        (entry) => !(entry.userId === memberUid && entry.workspaceId === normalized),
      );
      writePersisted({ customServers: state.customServers, memberships });
      return { memberships };
    });
    syncActiveWorkspace(get().joinedWorkspaces(memberUid), memberUid);
  },

  deleteWorkspace: async (workspaceId, userId) => {
    const memberUid = userId ?? currentMembershipUserId();
    const normalized = normalizeWorkspaceId(workspaceId);
    const role = get().roleIn(normalized, memberUid);
    if (!role) {
      throw new Error("Workspace introuvable.");
    }

    if (role !== "owner") {
      get().leaveWorkspace(normalized, memberUid);
      return;
    }

    if (memberUid !== LOCAL_USER_ID) {
      await deleteSharedWorkspace(normalized);
      const { removeWorkspaceIcon } = await import("../lib/firebase/workspaceIcon");
      void removeWorkspaceIcon(normalized).catch(() => {});
    }

    set((state) => {
      const customServers = state.customServers.filter((server) => server.id !== normalized);
      const memberships = state.memberships.filter((entry) => entry.workspaceId !== normalized);
      writePersisted({ customServers, memberships });
      return { customServers, memberships };
    });

    get().removePendingJoinRequest(normalized);

    const joined = get().joinedWorkspaces(memberUid);
    if (joined.length === 0) {
      const ownerName = useStore.getState().userDisplayName;
      get().createPersonalWorkspace(ownerName, memberUid);
    }
    syncActiveWorkspace(get().joinedWorkspaces(memberUid), memberUid);
  },

  resetLocalMemberships: () => {
    writePersisted({ customServers: [], memberships: [] });
    set({
      customServers: [],
      memberships: [],
      hydrated: true,
    });
  },

  stripLegacyPublicWorkspaces: () => {
    set((state) => {
      const next = sanitizePersisted({
        customServers: state.customServers,
        memberships: state.memberships,
      });
      writePersisted(next);
      return next;
    });
    syncActiveWorkspace(get().joinedWorkspaces(currentMembershipUserId()));
  },
}));

export function workspaceLabel(id: string): string {
  const workspace = useWorkspacesStore.getState().findWorkspace(id);
  return workspace?.name ?? "Serveur";
}

export async function acceptSharedWorkspaceJoin(
  workspaceId: string,
  userId = LOCAL_USER_ID,
): Promise<boolean> {
  const normalized = normalizeWorkspaceId(workspaceId);
  const shared = await fetchSharedWorkspace(normalized);
  if (!shared) return false;
  return useWorkspacesStore.getState().addRemoteWorkspace(shared, userId);
}
