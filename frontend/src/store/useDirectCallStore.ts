import { create } from "zustand";

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

/** Accepte l’identifiant affiché en bas de l’appel, ou un lien qui se termine par lui. */
export function directCallIdFromPaste(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const part = url.pathname.split("/").filter(Boolean).pop()?.trim();
    return part || null;
  } catch {
    return trimmed;
  }
}

interface DirectCallState {
  callId: string | null;
  startCall: () => void;
  joinCall: (raw: string) => boolean;
  leaveCall: () => void;
}

export const useDirectCallStore = create<DirectCallState>((set) => ({
  callId: null,
  startCall: () => set({ callId: createDirectCallId() }),
  joinCall: (raw) => {
    const callId = directCallIdFromPaste(raw);
    if (!callId) return false;
    set({ callId });
    return true;
  },
  leaveCall: () => set({ callId: null }),
}));
