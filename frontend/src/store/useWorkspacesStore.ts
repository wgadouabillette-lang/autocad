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
import {
  fetchSharedWorkspace,
  publishSharedWorkspace,
  requestWorkspaceJoin,
  respondWorkspaceJoinRequest,
  type WorkspaceJoinRequestDoc,
} from "../lib/firebase/workspaceRegistry";
import { useCallsStore } from "./useCallsStore";
import { useStore } from "./useStore";

const STORAGE_KEY = "forma-server-memberships";

interface PersistedState {
  customServers: Workspace[];
  memberships: ServerMembership[];
}

interface WorkspacesState extends PersistedState {
  hydrated: boolean;
  pendingJoinRequests: string[];
  incomingJoinRequests: WorkspaceJoinRequestDoc[];
  hydrate: () => void;
  addPendingJoinRequest: (workspaceId: string) => void;
  removePendingJoinRequest: (workspaceId: string) => void;
  findWorkspace: (id: string) => Workspace | undefined;
  joinedWorkspaces: (userId?: string) => Workspace[];
  membershipIn: (workspaceId: string, userId?: string) => ServerMembership | undefined;
  roleIn: (workspaceId: string, userId?: string) => ServerRole | null;
  isWorkspaceOwner: (workspaceId: string, userId?: string) => boolean;
  createWorkspace: (name: string, ownerName: string, userId?: string) => string;
  createPersonalWorkspace: (ownerName: string, userId?: string) => string;
  addRemoteWorkspace: (workspace: Workspace, userId?: string) => boolean;
  updateWorkspace: (
    workspaceId: string,
    patch: Partial<Pick<Workspace, "name" | "accent">>,
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
  ) => Promise<void>;
  leaveWorkspace: (workspaceId: string, userId?: string) => void;
  resetLocalMemberships: () => void;
  stripLegacyPublicWorkspaces: () => void;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function writePersisted(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizePersisted(state)));
}

function normalizeCustomServers(servers: Workspace[]): Workspace[] {
  return servers.map((server, index) => ({
    id: server.id,
    name: server.name,
    accent: server.accent ?? pickWorkspaceAccent(index),
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

function syncActiveWorkspace(joined: Workspace[]) {
  if (joined.length === 0) return;
  ensureJoinedWorkspaceRooms(joined);
  const active = normalizeWorkspaceId(useStore.getState().activeRoomId);
  const hasAccess = joined.some((server) => server.id === active);
  if (!hasAccess) {
    useStore.getState().setActiveRoom(joined[0].id);
  } else if (active !== useStore.getState().activeRoomId) {
    useStore.getState().setActiveRoom(active);
  }
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  customServers: [],
  memberships: [],
  hydrated: false,
  pendingJoinRequests: [],
  incomingJoinRequests: [],

  hydrate: () => {
    if (get().hydrated) return;
    const persisted = sanitizePersisted(readPersisted());
    const customServers = normalizeCustomServers(persisted.customServers);
    const memberships = normalizeMemberships(persisted.memberships);

    writePersisted({ customServers, memberships });
    set({
      customServers,
      memberships,
      hydrated: true,
    });
    get().stripLegacyPublicWorkspaces();
    if (get().joinedWorkspaces().length === 0) {
      const ownerName = useStore.getState().userDisplayName;
      get().createPersonalWorkspace(ownerName, LOCAL_USER_ID);
    }
    syncActiveWorkspace(get().joinedWorkspaces());
  },

  addPendingJoinRequest: (workspaceId) => {
    const normalized = normalizeWorkspaceId(workspaceId.trim());
    if (!normalized) return;
    set((state) => {
      if (state.pendingJoinRequests.includes(normalized)) return state;
      return { pendingJoinRequests: [...state.pendingJoinRequests, normalized] };
    });
  },

  removePendingJoinRequest: (workspaceId) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    set((state) => ({
      pendingJoinRequests: state.pendingJoinRequests.filter((id) => id !== normalized),
    }));
  },

  findWorkspace: (id) => {
    const normalized = normalizeWorkspaceId(id);
    return get().customServers.find((server) => server.id === normalized);
  },

  joinedWorkspaces: (userId = LOCAL_USER_ID) => {
    const joinedIds = new Set(
      get()
        .memberships.filter((entry) => entry.userId === userId)
        .map((entry) => entry.workspaceId),
    );
    return get().customServers.filter((server) => joinedIds.has(server.id));
  },

  membershipIn: (workspaceId, userId = LOCAL_USER_ID) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    return get().memberships.find(
      (entry) => entry.userId === userId && entry.workspaceId === normalized,
    );
  },

  roleIn: (workspaceId, userId = LOCAL_USER_ID) => {
    return get().membershipIn(workspaceId, userId)?.role ?? null;
  },

  isWorkspaceOwner: (workspaceId, userId = LOCAL_USER_ID) => {
    return get().roleIn(workspaceId, userId) === "owner";
  },

  createWorkspace: (name, ownerName, userId = LOCAL_USER_ID) => {
    const trimmed = name.trim();
    const base = slugify(trimmed) || `server-${Date.now()}`;
    const existing = new Set(get().customServers.map((server) => server.id));
    let id = base;
    let suffix = 2;
    while (existing.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
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

    void publishSharedWorkspace(server).catch(() => {
      // Le workspace reste utilisable localement même si l'enregistrement cloud échoue.
    });

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

  updateWorkspace: (workspaceId, patch, userId = LOCAL_USER_ID) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    if (get().roleIn(normalized, userId) !== "owner") return false;

    const trimmedName = patch.name?.trim();
    const nextPatch: Partial<Pick<Workspace, "name" | "accent">> = {
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
    const normalized = normalizeWorkspaceId(workspaceId.trim());
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

  respondJoinRequest: async (workspaceId, requesterUid, accept) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    if (!get().isWorkspaceOwner(normalized)) {
      throw new Error("Seul le propriétaire peut répondre aux demandes.");
    }
    await respondWorkspaceJoinRequest(normalized, requesterUid, accept);
  },

  leaveWorkspace: (workspaceId, userId = LOCAL_USER_ID) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    const membership = get().membershipIn(normalized, userId);
    if (!membership || membership.role === "owner") return;

    set((state) => {
      const memberships = state.memberships.filter(
        (entry) => !(entry.userId === userId && entry.workspaceId === normalized),
      );
      writePersisted({ customServers: state.customServers, memberships });
      return { memberships };
    });
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
    syncActiveWorkspace(get().joinedWorkspaces());
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
