import { auth } from "./firebase/client";
import { LOCAL_USER_ID, normalizeWorkspaceId } from "./workspaces";

const KEY_PREFIX = "forma-last-workspace:";

export function workspaceSessionUserId(): string {
  return auth.currentUser?.uid ?? LOCAL_USER_ID;
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function readLastActiveWorkspace(userId?: string): string | null {
  const uid = userId ?? workspaceSessionUserId();
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw || typeof raw !== "string") return null;
    const normalized = normalizeWorkspaceId(raw.trim());
    return normalized || null;
  } catch {
    return null;
  }
}

export function writeLastActiveWorkspace(workspaceId: string, userId?: string): void {
  const normalized = normalizeWorkspaceId(workspaceId.trim());
  if (!normalized) return;
  const uid = userId ?? workspaceSessionUserId();
  try {
    localStorage.setItem(storageKey(uid), normalized);
  } catch {
    // ignore quota / private mode
  }
}

export function resolveActiveWorkspaceId(
  joinedWorkspaceIds: string[],
  options?: { currentId?: string; userId?: string },
): string | null {
  if (joinedWorkspaceIds.length === 0) return null;

  const joined = new Set(
    joinedWorkspaceIds
      .map((id) => normalizeWorkspaceId(id))
      .filter((id): id is string => Boolean(id)),
  );

  const current = options?.currentId ? normalizeWorkspaceId(options.currentId) : "";
  if (current && joined.has(current)) return current;

  const last = readLastActiveWorkspace(options?.userId);
  if (last && joined.has(last)) return last;

  return joinedWorkspaceIds[0] ?? null;
}
