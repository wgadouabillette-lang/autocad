import { getDatabase } from "firebase-admin/database";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FUNCTIONS_REGION } from "./region";

async function syncGroupAcl(groupId: string, participants: string[]): Promise<void> {
  const gid = groupId.trim();
  if (!gid) return;
  const base = getDatabase().ref(`groupAcl/${gid}`);
  const unique = [...new Set(participants.map((p) => p.trim()).filter(Boolean))];
  const updates: Record<string, true | null> = {};
  const snap = await base.get();
  const existing = snap.exists() ? (snap.val() as Record<string, unknown>) : {};
  for (const uid of Object.keys(existing)) {
    if (!unique.includes(uid)) updates[uid] = null;
  }
  for (const uid of unique) {
    updates[uid] = true;
  }
  if (Object.keys(updates).length) {
    await base.update(updates);
  }
}

/** Miroir RTDB pour typing/group rules. */
export const onGroupChatAclWrite = onDocumentWritten(
  {
    document: "groupChats/{groupId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const groupId = String(event.params.groupId || "");
    const after = event.data?.after.data() ?? null;
    if (!after) {
      const gid = groupId.trim();
      if (gid) await getDatabase().ref(`groupAcl/${gid}`).remove();
      return;
    }
    const participants = Array.isArray(after.participants)
      ? after.participants.filter((p): p is string => typeof p === "string")
      : [];
    await syncGroupAcl(groupId, participants);
  },
);

export const ensureGroupAcl = onCall(
  { cors: true, region: FUNCTIONS_REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const groupId =
      typeof request.data?.groupId === "string" ? request.data.groupId.trim() : "";
    if (!groupId) throw new HttpsError("invalid-argument", "Invalid group id.");

    const snap = await getFirestore().doc(`groupChats/${groupId}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "Group not found.");
    const participants = Array.isArray(snap.data()?.participants)
      ? (snap.data()?.participants as unknown[]).filter(
          (p): p is string => typeof p === "string",
        )
      : [];
    if (!participants.includes(request.auth.uid)) {
      throw new HttpsError("permission-denied", "Not a group participant.");
    }
    await syncGroupAcl(groupId, participants);
    return { ok: true };
  },
);
