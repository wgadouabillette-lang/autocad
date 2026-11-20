import {
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import { rtdb } from "./client";
import type { RtcSignalDoc } from "./webrtcSignaling";
import type { RtcSignalTransport } from "../webrtc/workspaceVoiceRtc";

export interface DirectCallPeer {
  uid: string;
  displayName: string;
}

const STALE_AFTER_MS = 90_000;
const CALL_ID_RE = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

export function isDirectCallId(value: string): boolean {
  return CALL_ID_RE.test(value);
}

function roomPath(callId: string, uid: string): string {
  return `directCalls/${callId}/${uid}`;
}

function signalsPath(callId: string, toUid: string): string {
  return `directCallRtc/${callId}/${toUid}`;
}

export async function joinDirectCallRoom(
  callId: string,
  uid: string,
  displayName: string,
): Promise<void> {
  if (!isDirectCallId(callId)) throw new Error("Identifiant d'appel invalide");
  const node = ref(rtdb, roomPath(callId, uid));
  await onDisconnect(node).remove();
  const now = Date.now();
  await set(node, {
    uid,
    displayName: displayName.trim().slice(0, 120) || "Membre",
    joinedAt: now,
    lastSeen: now,
  });
}

export async function touchDirectCallRoom(callId: string, uid: string): Promise<void> {
  await update(ref(rtdb, roomPath(callId, uid)), { lastSeen: Date.now() });
}

export async function leaveDirectCallRoom(callId: string, uid: string): Promise<void> {
  const node = ref(rtdb, roomPath(callId, uid));
  await onDisconnect(node).cancel().catch(() => {});
  await remove(node);
}

export function watchDirectCallPeers(
  callId: string,
  localUid: string,
  onPeers: (peers: DirectCallPeer[]) => void,
): Unsubscribe {
  return onValue(ref(rtdb, `directCalls/${callId}`), (snap) => {
    const value = snap.val() as Record<
      string,
      { displayName?: string; joinedAt?: number; lastSeen?: number }
    > | null;
    const now = Date.now();
    const peers: DirectCallPeer[] = [];
    for (const [id, entry] of Object.entries(value ?? {})) {
      if (!entry || id === localUid) continue;
      const seen = entry.lastSeen ?? entry.joinedAt ?? 0;
      if (now - seen > STALE_AFTER_MS) continue;
      const displayName = typeof entry.displayName === "string" ? entry.displayName.trim() : "";
      if (!displayName) continue;
      peers.push({ uid: id, displayName });
    }
    peers.sort((a, b) => a.uid.localeCompare(b.uid));
    onPeers(peers);
  });
}

export function directCallRtcTransport(callId: string, localUid: string): RtcSignalTransport {
  return {
    send: async (signal) => {
      const signalRef = push(ref(rtdb, signalsPath(callId, signal.toUid)));
      await set(signalRef, { ...signal, createdAt: Date.now() });
    },
    subscribe: (onSignal) =>
      onChildAdded(ref(rtdb, signalsPath(callId, localUid)), (snap) => {
        const data = snap.val() as Omit<RtcSignalDoc, "id"> | null;
        if (!data || typeof data.fromUid !== "string" || typeof data.type !== "string") return;
        onSignal({ id: snap.key ?? undefined, ...data, toUid: localUid });
      }),
    remove: async (signalId) => {
      await remove(ref(rtdb, `${signalsPath(callId, localUid)}/${signalId}`));
    },
  };
}
