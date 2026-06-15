import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";

export type RtcSignalType = "offer" | "answer" | "candidate";

export interface RtcSignalDoc {
  id?: string;
  fromUid: string;
  toUid: string;
  type: RtcSignalType;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  createdAt?: unknown;
}

function signalsCol(workspaceId: string, sessionId: string) {
  return collection(db, "workspacesShared", workspaceId, "voiceRtc", sessionId, "signals");
}

function signalRef(workspaceId: string, sessionId: string, signalId: string) {
  return doc(db, "workspacesShared", workspaceId, "voiceRtc", sessionId, "signals", signalId);
}

export async function sendRtcSignal(
  workspaceId: string,
  sessionId: string,
  signal: Omit<RtcSignalDoc, "id" | "createdAt">,
): Promise<void> {
  await addDoc(signalsCol(workspaceId, sessionId), {
    ...signal,
    createdAt: serverTimestamp(),
  });
}

export async function deleteRtcSignal(
  workspaceId: string,
  sessionId: string,
  signalId: string,
): Promise<void> {
  await deleteDoc(signalRef(workspaceId, sessionId, signalId));
}

export function watchIncomingRtcSignals(
  workspaceId: string,
  sessionId: string,
  localUid: string,
  onSignal: (signal: RtcSignalDoc) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !sessionId || !localUid) {
    return () => {};
  }

  const q = query(signalsCol(workspaceId, sessionId), where("toUid", "==", localUid));
  return onSnapshot(
    q,
    (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        onSignal({ id: change.doc.id, ...(change.doc.data() as RtcSignalDoc) });
      }
    },
    onError,
  );
}
