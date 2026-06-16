import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";

export type VoiceKnockStatus = "pending" | "accepted" | "declined" | "ejected";

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

export async function sendVoiceEject(
  workspaceId: string,
  hostUid: string,
  hostName: string,
  remoteUid: string,
): Promise<void> {
  const id = `eject_${hostUid}_${remoteUid}`;
  await setDoc(doc(db, "workspacesShared", workspaceId, "voiceKnocks", id), {
    id,
    workspaceId,
    fromUid: hostUid,
    fromName: hostName.trim() || "Membre",
    toUid: remoteUid,
    status: "ejected",
    createdAt: serverTimestamp(),
  });
}

export function watchVoiceEjects(
  workspaceId: string,
  localUid: string,
  onEject: (knock: VoiceKnockDoc) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !localUid) {
    return () => {};
  }

  return onSnapshot(
    knocksCol(workspaceId),
    (snap) => {
      for (const entry of snap.docs) {
        const knock = entry.data() as VoiceKnockDoc;
        if (knock.status === "ejected" && knock.toUid === localUid) {
          onEject(knock);
        }
      }
    },
    onError,
  );
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

  return onSnapshot(
    knocksCol(workspaceId),
    (snap) => {
      const knocks = snap.docs
        .map((entry) => entry.data() as VoiceKnockDoc)
        .filter(
          (knock) =>
            knock.status === "pending" &&
            (knock.fromUid === localUid || knock.toUid === localUid),
        );
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
