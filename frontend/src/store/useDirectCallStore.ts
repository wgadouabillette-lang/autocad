import { create } from "zustand";
import type { DirectCallPeer } from "../lib/firebase/directCallRoom";
import type { RemoteParticipantStreams } from "../lib/webrtc/workspaceVoiceRtc";

const CALL_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomChunk(): string {
  let value = "";
  for (let index = 0; index < 4; index += 1) {
    value += CALL_ID_ALPHABET[Math.floor(Math.random() * CALL_ID_ALPHABET.length)];
  }
  return value;
}

export function createDirectCallId(): string {
  return `${randomChunk()}-${randomChunk()}`;
}

const CALL_ID_IN_TEXT = /[a-z0-9]{4}-[a-z0-9]{4}/i;

/** Accepte l’identifiant affiché en haut, ou un lien qui le contient. */
export function directCallIdFromPaste(raw: string): string | null {
  const match = raw.trim().toLowerCase().match(CALL_ID_IN_TEXT);
  return match?.[0] ?? null;
}

function samePeers(current: DirectCallPeer[], next: DirectCallPeer[]): boolean {
  return (
    current.length === next.length &&
    current.every(
      (peer, index) => peer.uid === next[index]?.uid && peer.displayName === next[index]?.displayName,
    )
  );
}

interface DirectCallState {
  callId: string | null;
  peers: DirectCallPeer[];
  remoteMediaByUid: Record<string, RemoteParticipantStreams>;
  startCall: () => void;
  joinCall: (raw: string) => boolean;
  leaveCall: () => void;
  setPeers: (peers: DirectCallPeer[]) => void;
  setRemoteMedia: (uid: string, media: RemoteParticipantStreams) => void;
  removeRemoteMedia: (uid: string) => void;
  clearRemoteMedia: () => void;
}

export const useDirectCallStore = create<DirectCallState>((set) => ({
  callId: null,
  peers: [],
  remoteMediaByUid: {},
  startCall: () => set({ callId: createDirectCallId(), peers: [], remoteMediaByUid: {} }),
  joinCall: (raw) => {
    const callId = directCallIdFromPaste(raw);
    if (!callId) return false;
    set({ callId, peers: [], remoteMediaByUid: {} });
    return true;
  },
  leaveCall: () => set({ callId: null, peers: [], remoteMediaByUid: {} }),
  setPeers: (peers) =>
    set((state) => (samePeers(state.peers, peers) ? state : { peers })),
  setRemoteMedia: (uid, media) =>
    set((state) => ({ remoteMediaByUid: { ...state.remoteMediaByUid, [uid]: media } })),
  removeRemoteMedia: (uid) =>
    set((state) => {
      if (!state.remoteMediaByUid[uid]) return state;
      const remoteMediaByUid = { ...state.remoteMediaByUid };
      delete remoteMediaByUid[uid];
      return { remoteMediaByUid };
    }),
  clearRemoteMedia: () => set({ remoteMediaByUid: {} }),
}));
