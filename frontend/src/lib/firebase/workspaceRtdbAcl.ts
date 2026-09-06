import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

const ensured = new Set<string>();
const inflight = new Map<string, Promise<void>>();

async function callEnsure(workspaceId: string): Promise<void> {
  const callable = httpsCallable<{ workspaceId: string }, { ok: boolean }>(
    functions,
    "ensureWorkspaceAcl",
  );
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await callable({ workspaceId });
      return;
    } catch (error) {
      lastError = error;
      // Brief backoff — ACL is required before any presence/knock RTDB access.
      await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Garantit workspaceAcl/{wid}/{uid} avant presence / knocks RTDB. */
export async function ensureWorkspaceRtdbAcl(workspaceId: string): Promise<void> {
  const wid = workspaceId.trim().toLowerCase();
  if (!wid) return;
  if (ensured.has(wid)) return;

  const existing = inflight.get(wid);
  if (existing) {
    await existing;
    return;
  }

  const run = (async () => {
    await callEnsure(wid);
    ensured.add(wid);
  })();

  inflight.set(wid, run);
  try {
    await run;
  } catch (error) {
    // Do not cache failures — next presence pulse can retry.
    ensured.delete(wid);
    throw error;
  } finally {
    inflight.delete(wid);
  }
}

export function clearWorkspaceRtdbAclCache(workspaceId?: string): void {
  if (!workspaceId) {
    ensured.clear();
    return;
  }
  ensured.delete(workspaceId.trim().toLowerCase());
}
