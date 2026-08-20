import type { ServerMembership, Workspace } from "../workspaces";
import { saveUserWorkspaces } from "./userData";

const WORKSPACE_SYNC_DEBOUNCE_MS = 900;

let lastSyncedKey: string | null = null;
let suppressCount = 0;
let debounceTimer: number | null = null;
let flushChain: Promise<void> = Promise.resolve();

function stableWorkspace(server: Workspace) {
  return {
    id: server.id,
    name: server.name,
    accent: server.accent,
    ownerId: server.ownerId,
    ownerName: server.ownerName,
    createdAt: server.createdAt,
    iconURL: server.iconURL ?? null,
    membersCanInvite: server.membersCanInvite !== false,
  };
}

function stableMembership(entry: ServerMembership) {
  return {
    userId: entry.userId,
    workspaceId: entry.workspaceId,
    role: entry.role,
    joinedAt: entry.joinedAt,
  };
}

/** Fingerprint local — évite lectures/écritures cloud si rien n'a changé. */
export function userWorkspacesSyncKey(data: {
  customServers: Workspace[];
  memberships: ServerMembership[];
}): string {
  const servers = data.customServers.map(stableWorkspace).sort((a, b) => a.id.localeCompare(b.id));
  const memberships = data.memberships
    .map(stableMembership)
    .sort((a, b) =>
      `${a.userId}:${a.workspaceId}`.localeCompare(`${b.userId}:${b.workspaceId}`),
    );
  return JSON.stringify({ servers, memberships });
}

export function markUserWorkspacesSynced(data: {
  customServers: Workspace[];
  memberships: ServerMembership[];
}): void {
  lastSyncedKey = userWorkspacesSyncKey(data);
}

export function clearUserWorkspacesSyncMarker(): void {
  lastSyncedKey = null;
}

export function isUserWorkspacesSynced(data: {
  customServers: Workspace[];
  memberships: ServerMembership[];
}): boolean {
  return lastSyncedKey !== null && lastSyncedKey === userWorkspacesSyncKey(data);
}

/** Ignore les syncs pendant le hydrate auth (rafales de setState). */
export function withWorkspaceCloudSyncSuppressed<T>(fn: () => T): T {
  suppressCount += 1;
  try {
    return fn();
  } finally {
    suppressCount -= 1;
  }
}

export function isWorkspaceCloudSyncSuppressed(): boolean {
  return suppressCount > 0;
}

async function flushWorkspacesToCloud(
  uid: string,
  data: { customServers: Workspace[]; memberships: ServerMembership[] },
): Promise<void> {
  if (!uid || isWorkspaceCloudSyncSuppressed()) return;
  if (isUserWorkspacesSynced(data)) return;
  await saveUserWorkspaces(uid, data);
  markUserWorkspacesSynced(data);
}

/** Sync immédiat (après une action utilisateur explicite). */
export function syncWorkspacesToCloudNow(
  uid: string,
  data: { customServers: Workspace[]; memberships: ServerMembership[] },
): Promise<void> {
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const run = flushWorkspacesToCloud(uid, data);
  flushChain = flushChain.then(
    () => run,
    () => run,
  );
  return run;
}

/** Sync debouncé — coalescer les updates locales rapprochées. */
export function scheduleSyncWorkspacesToCloud(
  uid: string,
  getData: () => { customServers: Workspace[]; memberships: ServerMembership[] },
  delayMs = WORKSPACE_SYNC_DEBOUNCE_MS,
): void {
  if (!uid || isWorkspaceCloudSyncSuppressed()) return;
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    const data = getData();
    flushChain = flushChain.then(
      () => flushWorkspacesToCloud(uid, data),
      () => flushWorkspacesToCloud(uid, data),
    );
  }, delayMs);
}
