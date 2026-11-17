import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./region";

const GROUP_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pairId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

async function areFriends(db: Firestore, a: string, b: string): Promise<boolean> {
  const friendship = await db.doc(`friendships/${pairId(a, b)}`).get();
  if (friendship.exists) {
    const participants = friendship.data()?.participants;
    if (Array.isArray(participants) && participants.includes(a) && participants.includes(b)) {
      return true;
    }
  }
  const edge = await db.doc(`users/${a}/friends/${b}`).get();
  return edge.exists;
}

async function workspaceIdsFor(db: Firestore, uid: string): Promise<string[]> {
  const ids = new Set<string>();
  const [memberships, ownedSpaces, ownedShared] = await Promise.all([
    db.collection(`users/${uid}/memberships`).get(),
    db.collection(`users/${uid}/workspaces`).get(),
    db.collection("workspacesShared").where("ownerId", "==", uid).limit(20).get(),
  ]);
  memberships.forEach((doc) => {
    const recorded = doc.data()?.workspaceId;
    const wid = typeof recorded === "string" && recorded.trim() ? recorded.trim() : doc.id;
    if (wid) ids.add(wid);
  });
  ownedSpaces.forEach((doc) => ids.add(doc.id));
  ownedShared.forEach((doc) => ids.add(doc.id));
  return [...ids].slice(0, 40);
}

async function sharesWorkspace(
  db: Firestore,
  callerUid: string,
  otherUid: string,
): Promise<boolean> {
  const ids = await workspaceIdsFor(db, callerUid);
  for (const wid of ids) {
    const workspace = await db.doc(`workspacesShared/${wid}`).get();
    if (!workspace.exists) continue;
    const data = workspace.data() ?? {};
    const callerIsOwner = data.ownerId === callerUid;
    const callerMembership = callerIsOwner
      ? null
      : await db.doc(`workspacesShared/${wid}/members/${callerUid}`).get();
    if (!callerIsOwner && !callerMembership?.exists) continue;
    if (data.ownerId === otherUid) return true;
    const otherMembership = await db.doc(`workspacesShared/${wid}/members/${otherUid}`).get();
    if (otherMembership.exists) return true;
  }
  return false;
}

export const createGroupChat = onCall({ cors: true, region: FUNCTIONS_REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const groupId = request.data?.groupId;
  const name = typeof request.data?.name === "string" ? request.data.name.trim() : "";
  const rawParticipants = request.data?.participants;
  const rawNames = request.data?.memberNames;
  if (typeof groupId !== "string" || !GROUP_ID_RE.test(groupId)) {
    throw new HttpsError("invalid-argument", "Invalid group id.");
  }
  if (name.length < 1 || name.length > 80) {
    throw new HttpsError("invalid-argument", "Invalid group name.");
  }
  if (!Array.isArray(rawParticipants)) {
    throw new HttpsError("invalid-argument", "Participants are required.");
  }

  const participants = [...new Set(rawParticipants.filter((id): id is string => typeof id === "string" && id.trim().length > 0))].sort();
  if (participants.length < 2 || participants.length > 32 || !participants.includes(callerUid)) {
    throw new HttpsError("invalid-argument", "Choose between 1 and 31 other people.");
  }

  const db = getFirestore();
  const existing = await db.doc(`groupChats/${groupId}`).get();
  if (existing.exists) {
    throw new HttpsError("already-exists", "This group already exists.");
  }

  for (const otherUid of participants) {
    if (otherUid === callerUid) continue;
    if (otherUid.includes("/") || otherUid.length > 128) {
      throw new HttpsError("permission-denied", "You can only add friends or workspace members.");
    }
    const allowed = (await areFriends(db, callerUid, otherUid)) || (await sharesWorkspace(db, callerUid, otherUid));
    if (!allowed) {
      throw new HttpsError("permission-denied", "You can only add friends or workspace members.");
    }
  }

  const memberNames: Record<string, string> = {};
  if (rawNames && typeof rawNames === "object") {
    for (const uid of participants) {
      const value = (rawNames as Record<string, unknown>)[uid];
      if (typeof value === "string" && value.trim()) {
        memberNames[uid] = value.trim().slice(0, 120);
      }
    }
  }

  await db.doc(`groupChats/${groupId}`).set({
    name,
    participants,
    creatorUid: callerUid,
    memberNames,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { groupId };
});
