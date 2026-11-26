import { create } from "zustand";
import { structureAiNotesTranscript, workspacePeopleNames } from "../lib/aiNotesStructure";
import { inCallParticipants } from "../lib/calls";
import {
  isVoiceNotesSupported,
  startVoiceNotesSession,
  stopVoiceNotesSession,
  type CallSpeakersUpdate,
  type VoiceNotesTranscriptChunk,
  type WatchCallSpeakers,
} from "../lib/voiceAiNotesSession";
import { saveRecordingBlob } from "../lib/recordingsStorage";
import { useAuthStore } from "./useAuthStore";
import { useCallsStore } from "./useCallsStore";
import { useStore } from "./useStore";
import { useWorkspacePresenceStore } from "./useWorkspacePresenceStore";

export interface AiNotesLine {
  id: string;
  text: string;
  isFinal: boolean;
  at?: number;
  speakerId?: string;
  speakerName?: string;
}

interface AiNotesState {
  active: boolean;
  busy: boolean;
  lines: AiNotesLine[];
  interimText: string;
  structuredHtml: string;
  structuring: boolean;
  structureError: string | null;
  nextStructureAt: number | null;
  error: string | null;
  startedAt: number | null;
  workspaceId: string | null;
  sessionId: string | null;

  toggle: (workspaceId: string, manualNoteId?: string | null) => Promise<void>;
  stop: () => Promise<void>;
  structureText: (transcript: string) => Promise<void>;
}

let structureAbortController: AbortController | null = null;
let structureInFlight = false;

function isInVoiceSession(workspaceId: string): boolean {
  const calls = useCallsStore.getState();
  const mode = calls.getCallsViewMode(workspaceId);
  return (
    calls.isLocalInCall(workspaceId) ||
    (mode === "theater" && calls.isLocalInTheaterCall(workspaceId))
  );
}

function personName(workspaceId: string, uid: string): string {
  const presence = useWorkspacePresenceStore.getState().membersByWorkspace[workspaceId]?.[uid];
  const fromPresence = presence?.displayName?.trim();
  if (fromPresence) return fromPresence;

  const calls = useCallsStore.getState();
  const room = calls.callsByRoom[workspaceId];
  if (room) {
    const people = [
      ...room.blocks.flatMap((block) => block.participants),
      ...room.openChannels.flatMap((channel) => channel.participants),
    ];
    const person = people.find((entry) => entry.id === uid && !entry.isLocal);
    if (person?.name.trim()) return person.name.trim();
  }
  const theater = calls.theaterByWorkspace[workspaceId];
  if (theater) {
    const people = [...theater.speakers, ...theater.audience];
    if (theater.question) people.push(theater.question);
    const person = people.find((entry) => entry.id === uid && !entry.isLocal);
    if (person?.name.trim()) return person.name.trim();
  }
  return "Participant";
}

function callHasOtherPeople(workspaceId: string): boolean {
  const calls = useCallsStore.getState();
  if (calls.isLocalInCall(workspaceId)) {
    const room = calls.callsByRoom[workspaceId];
    if (room) {
      const people = inCallParticipants(
        room.blocks,
        room.openChannels,
        true,
        calls.localOpenChannelByRoom[workspaceId] ?? null,
      );
      if (people.length > 1) return true;
    }
  }
  if (calls.isLocalInTheaterCall(workspaceId)) {
    const theater = calls.theaterByWorkspace[workspaceId];
    if (!theater) return false;
    const voices = theater.speakers.length + (theater.question ? 1 : 0);
    if (voices > 1) return true;
    if (theater.localRole === "audience" && voices > 0) return true;
  }
  return false;
}

function readCallSpeakers(workspaceId: string): CallSpeakersUpdate {
  const calls = useCallsStore.getState();
  const remotes = Object.entries(calls.remoteMediaByUid).flatMap(([uid, media]) =>
    media.audioStream
      ? [{ id: uid, name: personName(workspaceId, uid), stream: media.audioStream }]
      : [],
  );
  return {
    localId: useAuthStore.getState().firebaseUid || "local",
    localName: useStore.getState().userDisplayName.trim() || "Vous",
    multi: remotes.length > 0 || callHasOtherPeople(workspaceId),
    remotes,
    nameHint: workspacePeopleNames(workspaceId).join(", ").slice(0, 200),
  };
}

function watchCallSpeakers(workspaceId: string): WatchCallSpeakers {
  return (listener) => {
    const emit = () => listener(readCallSpeakers(workspaceId));
    emit();
    const unsubCalls = useCallsStore.subscribe((state, previous) => {
      if (
        state.remoteMediaByUid === previous.remoteMediaByUid &&
        state.callsByRoom[workspaceId] === previous.callsByRoom[workspaceId] &&
        state.theaterByWorkspace[workspaceId] === previous.theaterByWorkspace[workspaceId] &&
        state.localInCallByRoom[workspaceId] === previous.localInCallByRoom[workspaceId] &&
        state.localOpenChannelByRoom[workspaceId] === previous.localOpenChannelByRoom[workspaceId]
      ) {
        return;
      }
      emit();
    });
    const unsubPresence = useWorkspacePresenceStore.subscribe((state, previous) => {
      if (state.membersByWorkspace[workspaceId] === previous.membersByWorkspace[workspaceId]) return;
      emit();
    });
    const timer = window.setInterval(emit, 1_500);
    return () => {
      unsubCalls();
      unsubPresence();
      window.clearInterval(timer);
    };
  };
}

export function formatAiNotesTranscript(lines: AiNotesLine[], interimText: string): string {
  const ordered = lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      if (a.line.at == null && b.line.at == null) return a.index - b.index;
      if (a.line.at == null) return 1;
      if (b.line.at == null) return -1;
      return a.line.at - b.line.at || a.index - b.index;
    })
    .map((entry) => entry.line);

  const turns: string[] = [];
  let currentKey: string | null = null;
  let current = "";
  const push = (speakerId: string | undefined, speakerName: string | undefined, text: string) => {
    const piece = text.trim();
    if (!piece) return;
    const key = speakerId ?? "";
    if (current && key === currentKey) {
      current = `${current} ${piece}`;
      return;
    }
    if (current) turns.push(current);
    currentKey = key;
    const name = speakerName?.trim();
    current = name ? `${name}: ${piece}` : piece;
  };

  for (const line of ordered) {
    if (!line.isFinal) continue;
    push(line.speakerId, line.speakerName, line.text);
  }
  if (interimText.trim()) push(undefined, undefined, interimText);
  if (current) turns.push(current);
  return turns.join("\n").trim();
}

function buildTranscript(lines: AiNotesLine[], interimText: string): string {
  return formatAiNotesTranscript(lines, interimText);
}

function handleTranscriptChunk(
  chunk: VoiceNotesTranscriptChunk,
  lines: AiNotesLine[],
): Pick<AiNotesState, "lines" | "interimText"> {
  if (chunk.isFinal) {
    const line: AiNotesLine = {
      id: `ln-${chunk.speakerId ?? "me"}-${chunk.at}-${lines.length}`,
      text: chunk.text,
      isFinal: true,
      at: chunk.at,
      speakerId: chunk.speakerId,
      speakerName: chunk.speakerName,
    };
    return { lines: [...lines, line], interimText: "" };
  }
  return { lines, interimText: chunk.text };
}

function abortStructure() {
  structureAbortController?.abort();
  structureAbortController = null;
  structureInFlight = false;
}

async function runFinalStructure(
  get: () => AiNotesState,
  set: (partial: Partial<AiNotesState> | ((state: AiNotesState) => Partial<AiNotesState>)) => void,
  transcriptOverride?: string,
) {
  const transcript = (transcriptOverride ?? buildTranscript(get().lines, get().interimText)).trim();
  if (!transcript || structureInFlight) return;

  structureInFlight = true;
  set({ structuring: true, structureError: null });
  structureAbortController = new AbortController();

  try {
    const html = await structureAiNotesTranscript({
      transcript,
      workspaceId: get().workspaceId ?? undefined,
      signal: structureAbortController.signal,
    });

    set({
      structuredHtml: html,
      structuring: false,
      structureError: null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    const message =
      error instanceof Error ? error.message : "Structuration IA indisponible.";
    set({ structuring: false, structureError: message });
  } finally {
    structureInFlight = false;
    structureAbortController = null;
  }
}

export const useAiNotesStore = create<AiNotesState>((set, get) => ({
  active: false,
  busy: false,
  lines: [],
  interimText: "",
  structuredHtml: "",
  structuring: false,
  structureError: null,
  nextStructureAt: null,
  error: null,
  startedAt: null,
  workspaceId: null,
  sessionId: null,

  stop: async () => {
    const { isMarketingPreview } = await import("../lib/marketingPreview");
    if (isMarketingPreview()) {
      abortStructure();
      set({
        active: false,
        busy: false,
        nextStructureAt: null,
      });
      return;
    }
    if (get().busy || !get().active) return;

    const { sessionId } = get();

    abortStructure();
    set({ busy: true, active: false, nextStructureAt: null });

    try {
      const { blob } = await stopVoiceNotesSession();

      if (sessionId && blob && blob.size > 0) {
        await saveRecordingBlob(sessionId, blob);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'arrêter AI Notes.";
      set({ error: message });
    }

    set({
      busy: false,
      lines: [],
      interimText: "",
      startedAt: null,
      workspaceId: null,
    });
  },

  toggle: async (workspaceId, manualNoteId) => {
    const { isMarketingPreview } = await import("../lib/marketingPreview");
    if (isMarketingPreview()) {
      if (get().active) {
        await get().stop();
        return;
      }
      const { beginMarketingPreviewAiNotesFromClick } = await import(
        "../lib/marketingPreviewNotesDemo"
      );
      beginMarketingPreviewAiNotesFromClick(workspaceId, manualNoteId);
      return;
    }
    if (get().busy) return;

    if (get().active) {
      await get().stop();
      return;
    }

    if (!isVoiceNotesSupported()) {
      set({ error: "La transcription live n'est pas disponible dans ce navigateur." });
      return;
    }

    set({
      busy: true,
      error: null,
      structureError: null,
      structuredHtml: "",
    });

    try {
      if (!isInVoiceSession(workspaceId)) {
        await useCallsStore.getState().joinCall(workspaceId);
      }

      const sessionId = manualNoteId ?? `note-${Date.now()}`;

      await startVoiceNotesSession(
        (chunk) => {
          set((state) => ({
            ...handleTranscriptChunk(chunk, state.lines),
            error: null,
          }));
        },
        (message) => set({ error: message }),
        watchCallSpeakers(workspaceId),
      );

      set({
        active: true,
        busy: false,
        lines: [],
        interimText: "",
        startedAt: Date.now(),
        workspaceId,
        sessionId,
        nextStructureAt: null,
      });
    } catch (error) {
      abortStructure();
      const message =
        error instanceof Error ? error.message : "Impossible de démarrer AI Notes.";
      set({
        active: false,
        busy: false,
        error: message,
        lines: [],
        interimText: "",
        structuredHtml: "",
        structureError: null,
        nextStructureAt: null,
        startedAt: null,
        workspaceId: null,
        sessionId: null,
      });
    }
  },

  structureText: async (transcript) => {
    const trimmed = transcript.trim();
    if (!trimmed || get().structuring) return;
    await runFinalStructure(get, set, trimmed);
  },
}));
