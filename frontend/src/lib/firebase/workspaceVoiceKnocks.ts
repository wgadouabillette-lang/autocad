import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";

export type VoiceKnockStatus = "pending" | "accepted" | "declined";

export interface VoiceKnockDoc {
  id: string;
  workspaceId: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  status: VoiceKnockStatus;
  createdAt?: unknown;
  respondedAt?: unknown;
}

function knockId(fromUid: string, toUid: string): string {
  return `${fromUid}_${toUid}`;
}

function knockRef(workspaceId: string, fromUid: string, toUid: string) {
  return doc(db, "workspacesShared", workspaceId, "voiceKnocks", knockId(fromUid, toUid));
}

function knocksCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId, "voiceKnocks");
}

export async function sendVoiceKnock(
  workspaceId: string,
  fromUid: string,
  fromName: string,
  toUid: string,
): Promise<string> {
  const id = knockId(fromUid, toUid);
  await setDoc(knockRef(workspaceId, fromUid, toUid), {
    id,
    workspaceId,
    fromUid,
    fromName: fromName.trim() || "Membre",
    toUid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function respondVoiceKnock(
  workspaceId: string,
  fromUid: string,
  toUid: string,
  accept: boolean,
): Promise<void> {
  await updateDoc(knockRef(workspaceId, fromUid, toUid), {
    status: accept ? "accepted" : "declined",
    respondedAt: serverTimestamp(),
  });
}

export async function cancelVoiceKnock(
  workspaceId: string,
  fromUid: string,
  toUid: string,
): Promise<void> {
  await respondVoiceKnock(workspaceId, fromUid, toUid, false);
}

export function watchVoiceKnocks(
  workspaceId: string,
  localUid: string,
  onChange: (knocks: VoiceKnockDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !localUid) {
    onChange([]);
    return () => {};
  }

  const pendingQuery = query(
    knocksCol(workspaceId),
    where("status", "==", "pending"),
  );

  return onSnapshot(
    pendingQuery,
    (snap) => {
      const knocks = snap.docs
        .map((entry) => entry.data() as VoiceKnockDoc)
        .filter((knock) => knock.fromUid === localUid || knock.toUid === localUid);
      onChange(knocks);
    },
    onError,
  );
}

export function watchVoiceKnockResponses(
  workspaceId: string,
  localUid: string,
  onChange: (knocks: VoiceKnockDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !localUid) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    knocksCol(workspaceId),
    (snap) => {
      const knocks = snap.docs
        .map((entry) => entry.data() as VoiceKnockDoc)
        .filter(
          (knock) =>
            knock.fromUid === localUid &&
            (knock.status === "accepted" || knock.status === "declined"),
        );
      onChange(knocks);
    },
    onError,
  );
}
