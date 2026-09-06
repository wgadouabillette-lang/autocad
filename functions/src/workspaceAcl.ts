import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FUNCTIONS_REGION } from "./region";

function normalizeWorkspaceId(workspaceId: unknown): string {
  if (typeof workspaceId !== "string") return "";
  return workspaceId.trim().toLowerCase();
}

async function setAcl(workspaceId: string, uid: string, allowed: boolean): Promise<void> {
  const wid = normalizeWorkspaceId(workspaceId);
  const memberUid = typeof uid === "string" ? uid.trim() : "";
  if (!wid || !memberUid) return;
  const ref = getDatabase().ref(`workspaceAcl/${wid}/${memberUid}`);
  if (allowed) {
    await ref.set(true);
  } else {
    await ref.remove();
  }
}

/** Miroir RTDB pour les règles presence / knocks / typing workspace. */
export const onWorkspaceMemberAclWrite = onDocumentWritten(
  {
    document: "workspacesShared/{workspaceId}/members/{memberUid}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const workspaceId = String(event.params.workspaceId || "");
    const memberUid = String(event.params.memberUid || "");
    const exists = event.data?.after.exists === true;
    await setAcl(workspaceId, memberUid, exists);
  },
);

/** Owner ACL quand le doc workspace est créé / ownerId change. */
export const onWorkspaceSharedAclWrite = onDocumentWritten(
  {
    document: "workspacesShared/{workspaceId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const workspaceId = String(event.params.workspaceId || "");
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    if (!after) {
      const wid = normalizeWorkspaceId(workspaceId);
      if (wid) await getDatabase().ref(`workspaceAcl/${wid}`).remove();
      return;
    }
    const ownerId = typeof after.ownerId === "string" ? after.ownerId.trim() : "";
    if (ownerId) await setAcl(workspaceId, ownerId, true);
    const prevOwner = typeof before?.ownerId === "string" ? before.ownerId.trim() : "";
    if (prevOwner && prevOwner !== ownerId) {
      const member = await getFirestore()
        .doc(`workspacesShared/${normalizeWorkspaceId(workspaceId)}/members/${prevOwner}`)
        .get();
      if (!member.exists) await setAcl(workspaceId, prevOwner, false);
    }
  },
);

/**
 * Backfill / ensure ACL for the signed-in user (called before presence).
 * Verifies Firestore membership or ownership, then writes RTDB flag.
 */
export async function ensureWorkspaceAclForUid(
  uid: string,
  workspaceId: string,
): Promise<{ ok: true }> {
  const wid = normalizeWorkspaceId(workspaceId);
  if (!wid) throw new HttpsError("invalid-argument", "Invalid workspace id.");

  const db = getFirestore();
  const ws = await db.doc(`workspacesShared/${wid}`).get();
  if (!ws.exists) {
    throw new HttpsError("not-found", "Workspace not found.");
  }
  const ownerId = typeof ws.data()?.ownerId === "string" ? String(ws.data()?.ownerId).trim() : "";
  if (ownerId === uid) {
    await setAcl(wid, uid, true);
    return { ok: true };
  }
  const member = await db.doc(`workspacesShared/${wid}/members/${uid}`).get();
  if (!member.exists) {
    throw new HttpsError("permission-denied", "Not a workspace member.");
  }
  await setAcl(wid, uid, true);
  return { ok: true };
}

export const ensureWorkspaceAcl = onCall(
  { cors: true, region: FUNCTIONS_REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    return ensureWorkspaceAclForUid(request.auth.uid, request.data?.workspaceId);
  },
);
