import { create } from "zustand";
import {
  DEFAULT_WORKSPACE_ID,
  LOCAL_USER_ID,
  normalizeWorkspaceId,
  pickWorkspaceAccent,
  PUBLIC_SERVERS,
  type ServerMembership,
  type ServerRole,
  type Workspace,
} from "../lib/workspaces";
import { useCallsStore } from "./useCallsStore";
import { useStore } from "./useStore";

const STORAGE_KEY = "forma-server-memberships";
const MEMBERSHIPS_SEED_VERSION = 3;
const MEMBERSHIPS_SEED_VERSION_KEY = "forma-server-memberships-seed-version";

interface PersistedState {
  customServers: Workspace[];
  memberships: ServerMembership[];
}

interface WorkspacesState extends PersistedState {
  hydrated: boolean;
  hydrate: () => void;
  findWorkspace: (id: string) => Workspace | undefined;
  joinedWorkspaces: (userId?: string) => Workspace[];
  discoverableServers: (userId?: string) => Workspace[];
  membershipIn: (workspaceId: string, userId?: string) => ServerMembership | undefined;
  roleIn: (workspaceId: string, userId?: string) => ServerRole | null;
  isWorkspaceOwner: (workspaceId: string, userId?: string) => boolean;
  createWorkspace: (name: string, ownerName: string, userId?: string) => string;
  updateWorkspace: (
    workspaceId: string,
    patch: Partial<Pick<Workspace, "name" | "accent">>,
    userId?: string,
  ) => boolean;
  joinWorkspace: (workspaceId: string, userId?: string) => boolean;
  leaveWorkspace: (workspaceId: string, userId?: string) => void;
  resetLocalMemberships: () => void;
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
    return {
      customServers: Array.isArray(data.customServers) ? data.customServers : [],
      memberships: Array.isArray(data.memberships) ? data.memberships : [],
    };
  } catch {
    return { customServers: [], memberships: [] };
  }
}

function writePersisted(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedMemberships(): ServerMembership[] {
  return PUBLIC_SERVERS.map((server, index) => ({
    workspaceId: server.id,
    userId: LOCAL_USER_ID,
    role: "member",
    joinedAt: Date.now() - index * 60_000,
  }));
}

/** Seed de test : impose les 5 workspaces publics sur le compte local. */
function applyTestMemberships(memberships: ServerMembership[]): ServerMembership[] {
  const publicIds = new Set(PUBLIC_SERVERS.map((server) => server.id));
  const preserved = memberships.filter(
    (entry) =>
      entry.userId !== LOCAL_USER_ID ||
      !publicIds.has(normalizeWorkspaceId(entry.workspaceId)),
  );
  return normalizeMemberships([...preserved, ...seedMemberships()]);
}

function shouldRefreshTestMemberships(): boolean {
  const stored = Number(localStorage.getItem(MEMBERSHIPS_SEED_VERSION_KEY) ?? 0);
  return stored < MEMBERSHIPS_SEED_VERSION;
}

function markTestMembershipsRefreshed() {
  localStorage.setItem(MEMBERSHIPS_SEED_VERSION_KEY, String(MEMBERSHIPS_SEED_VERSION));
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
    const key = `${entry.userId}:${workspaceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ ...entry, workspaceId });
  }
  return normalized.length > 0 ? normalized : seedMemberships();
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

function allServers(customServers: Workspace[]): Workspace[] {
  const customIds = new Set(customServers.map((server) => server.id));
  return [...PUBLIC_SERVERS.filter((server) => !customIds.has(server.id)), ...customServers];
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  customServers: [],
  memberships: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const persisted = readPersisted();
    const customServers = normalizeCustomServers(persisted.customServers);
    const needsTestSeedRefresh = shouldRefreshTestMemberships();
    const memberships = needsTestSeedRefresh
      ? applyTestMemberships(persisted.memberships)
      : normalizeMemberships(persisted.memberships);

    if (needsTestSeedRefresh) {
      markTestMembershipsRefreshed();
    }

    writePersisted({ customServers, memberships });
    set({
      customServers,
      memberships,
      hydrated: true,
    });
    syncActiveWorkspace(get().joinedWorkspaces());
  },

  findWorkspace: (id) => {
    const normalized = normalizeWorkspaceId(id);
    return allServers(get().customServers).find((server) => server.id === normalized);
  },

  joinedWorkspaces: (userId = LOCAL_USER_ID) => {
    const joinedIds = new Set(
      get()
        .memberships.filter((entry) => entry.userId === userId)
        .map((entry) => entry.workspaceId),
    );
    return allServers(get().customServers).filter((server) => joinedIds.has(server.id));
  },

  discoverableServers: (userId = LOCAL_USER_ID) => {
    const joinedIds = new Set(
      get()
        .memberships.filter((entry) => entry.userId === userId)
        .map((entry) => entry.workspaceId),
    );
    return allServers(get().customServers).filter((server) => !joinedIds.has(server.id));
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
    const existing = new Set(allServers(get().customServers).map((server) => server.id));
    let id = base;
    let suffix = 2;
    while (existing.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    const server: Workspace = {
      id,
      name: trimmed,
      accent: pickWorkspaceAccent(get().customServers.length + PUBLIC_SERVERS.length),
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

    return id;
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
      return { customServers };
    });
    return true;
  },

  joinWorkspace: (workspaceId, userId = LOCAL_USER_ID) => {
    const normalized = normalizeWorkspaceId(workspaceId);
    const server = get().findWorkspace(normalized);
    if (!server) return false;
    if (get().membershipIn(normalized, userId)) return false;

    const membership: ServerMembership = {
      workspaceId: normalized,
      userId,
      role: server.ownerId === userId ? "owner" : "member",
      joinedAt: Date.now(),
    };

    set((state) => {
      const memberships = [...state.memberships, membership];
      writePersisted({ customServers: state.customServers, memberships });
      return { memberships };
    });
    return true;
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
}));

export function workspaceLabel(id: string): string {
  const workspace = useWorkspacesStore.getState().findWorkspace(id);
  return workspace?.name ?? "Serveur";
}
