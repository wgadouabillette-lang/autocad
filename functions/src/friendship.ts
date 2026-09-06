import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FUNCTIONS_REGION } from "./region";

function pairId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

async function materializeFriendship(input: {
  fromUid: string;
  toUid: string;
  requestId?: string;
}): Promise<void> {
  const fromUid = input.fromUid.trim();
  const toUid = input.toUid.trim();
  if (!fromUid || !toUid || fromUid === toUid) return;

  const db = getFirestore();
  const id = pairId(fromUid, toUid);
  const participants = [fromUid, toUid].sort();
  const batch = db.batch();
  const requestId = input.requestId || "";

  batch.set(
    db.doc(`friendships/${id}`),
    {
      id,
      participants,
      createdAt: FieldValue.serverTimestamp(),
      fromUid,
      toUid,
      requestId,
    },
    { merge: true },
  );
  batch.set(
    db.doc(`users/${fromUid}/friends/${toUid}`),
    {
      uid: toUid,
      since: FieldValue.serverTimestamp(),
      viaRequestId: requestId,
    },
    { merge: true },
  );
  batch.set(
    db.doc(`users/${toUid}/friends/${fromUid}`),
    {
      uid: fromUid,
      since: FieldValue.serverTimestamp(),
      viaRequestId: requestId,
    },
    { merge: true },
  );
  await batch.commit();

  // Miroir RTDB pour typing/friend (pairId = chatId).
  const rtdb = (await import("firebase-admin/database")).getDatabase();
  await rtdb.ref(`friendAcl/${id}`).set({ [fromUid]: true, [toUid]: true });
}

/** Quand une demande d'ami est acceptée → friendships + edges users/{uid}/friends. */
export const onFriendRequestAccepted = onDocumentUpdated(
  {
    document: "friendRequests/{requestId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    if (!after || after.status !== "accepted") return;
    if (before?.status === "accepted") return;

    const fromUid = typeof after.fromUid === "string" ? after.fromUid.trim() : "";
    const toUid = typeof after.toUid === "string" ? after.toUid.trim() : "";
    if (!fromUid || !toUid) return;

    await materializeFriendship({
      fromUid,
      toUid,
      requestId: String(event.params.requestId || ""),
    });
  },
);

/**
 * Backfill / ensure friendship before opening a DM (legacy accepted requests).
 */
export const ensureFriendship = onCall(
  { cors: true, region: FUNCTIONS_REGION },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    const otherUid =
      typeof request.data?.otherUid === "string" ? request.data.otherUid.trim() : "";
    if (!otherUid || otherUid === request.auth.uid) {
      throw new HttpsError("invalid-argument", "Invalid otherUid.");
    }

    const db = getFirestore();
    const id = pairId(request.auth.uid, otherUid);
    const existing = await db.doc(`friendships/${id}`).get();
    if (existing.exists) return { ok: true, pairId: id };

    const asFrom = await db
      .collection("friendRequests")
      .where("fromUid", "==", request.auth.uid)
      .limit(40)
      .get();
    const asTo = await db
      .collection("friendRequests")
      .where("toUid", "==", request.auth.uid)
      .limit(40)
      .get();

    const mine =
      asFrom.docs.find((docSnap) => {
        const data = docSnap.data();
        return data.status === "accepted" && String(data.toUid || "") === otherUid;
      }) ||
      asTo.docs.find((docSnap) => {
        const data = docSnap.data();
        return data.status === "accepted" && String(data.fromUid || "") === otherUid;
      });

    if (!mine) {
      throw new HttpsError("permission-denied", "Not friends.");
    }

    const data = mine.data();
    await materializeFriendship({
      fromUid: String(data.fromUid || ""),
      toUid: String(data.toUid || request.auth.uid),
      requestId: mine.id,
    });
    return { ok: true, pairId: id };
  },
);
