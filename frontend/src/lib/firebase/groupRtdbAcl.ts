import { httpsCallable } from "firebase/functions";
import { functions } from "./client";

const ensured = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export async function ensureGroupRtdbAcl(groupId: string): Promise<void> {
  const gid = groupId.trim();
  if (!gid) return;
  if (ensured.has(gid)) return;

  const existing = inflight.get(gid);
  if (existing) {
    await existing;
    return;
  }

  const run = (async () => {
    const callable = httpsCallable<{ groupId: string }, { ok: boolean }>(
      functions,
      "ensureGroupAcl",
    );
    await callable({ groupId: gid });
    ensured.add(gid);
  })();

  inflight.set(gid, run);
  try {
    await run;
  } finally {
    inflight.delete(gid);
  }
}
