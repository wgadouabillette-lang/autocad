import {
  onChildAdded,
  push,
  ref,
  remove,
  set,
  type Unsubscribe,
} from "firebase/database";
import { rtdb } from "./client";

export type RtcSignalType = "offer" | "answer" | "candidate";

export interface RtcSignalDoc {
  id?: string;
  fromUid: string;
  toUid: string;
  type: RtcSignalType;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  createdAt?: number;
}

function signalsPath(workspaceId: string, sessionId: string, toUid: string) {
  return `voiceRtc/${workspaceId}/${sessionId}/${toUid}`;
}

function signalPath(workspaceId: string, sessionId: string, toUid: string, signalId: string) {
  return `${signalsPath(workspaceId, sessionId, toUid)}/${signalId}`;
}

export async function sendRtcSignal(
  workspaceId: string,
  sessionId: string,
  signal: Omit<RtcSignalDoc, "id" | "createdAt">,
): Promise<void> {
  const listRef = ref(rtdb, signalsPath(workspaceId, sessionId, signal.toUid));
  const signalRef = push(listRef);
  await set(signalRef, {
    ...signal,
    createdAt: Date.now(),
  });
}

export async function deleteRtcSignal(
  workspaceId: string,
  sessionId: string,
  signalId: string,
  toUid?: string,
): Promise<void> {
  if (!toUid) return;
  await remove(ref(rtdb, signalPath(workspaceId, sessionId, toUid, signalId)));
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

  return onChildAdded(
    ref(rtdb, signalsPath(workspaceId, sessionId, localUid)),
    (snap) => {
      const data = snap.val() as Omit<RtcSignalDoc, "id"> | null;
      if (!data || typeof data.fromUid !== "string" || typeof data.type !== "string") return;
      onSignal({ id: snap.key ?? undefined, ...data, toUid: localUid });
    },
    (error) => {
      onError?.(error);
    },
  );
}
