import { create } from "zustand";
import {
  AI_NOTES_STRUCTURE_INTERVAL_MS,
  structureAiNotesTranscript,
} from "../lib/aiNotesStructure";
import {
  isVoiceNotesSupported,
  startVoiceNotesSession,
  stopVoiceNotesSession,
  type VoiceNotesTranscriptChunk,
} from "../lib/voiceAiNotesSession";
import { saveRecordingBlob } from "../lib/recordingsStorage";
import { useCallsStore } from "./useCallsStore";

export interface AiNotesLine {
  id: string;
  text: string;
  isFinal: boolean;
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
}

let structureIntervalId: number | null = null;
let structureAbortController: AbortController | null = null;
let structureInFlight = false;
let structureQueued = false;

function isInVoiceSession(workspaceId: string): boolean {
  const calls = useCallsStore.getState();
  const mode = calls.getCallsViewMode(workspaceId);
  return (
    calls.isLocalInCall(workspaceId) ||
    (mode === "theater" && calls.isLocalInTheaterCall(workspaceId))
  );
}

function buildTranscript(lines: AiNotesLine[], interimText: string): string {
  const finals = lines.filter((l) => l.isFinal).map((l) => l.text);
  if (interimText.trim()) finals.push(interimText.trim());
  return finals.join("\n").trim();
}

function handleTranscriptChunk(
  chunk: VoiceNotesTranscriptChunk,
  lines: AiNotesLine[],
): Pick<AiNotesState, "lines" | "interimText"> {
  if (chunk.isFinal) {
    return {
      lines: [
        ...lines,
        { id: `ln-${chunk.at}`, text: chunk.text, isFinal: true },
      ],
      interimText: "",
    };
  }
  return { lines, interimText: chunk.text };
}

function clearStructureLoop() {
  if (structureIntervalId !== null) {
    window.clearInterval(structureIntervalId);
    structureIntervalId = null;
  }
  structureAbortController?.abort();
  structureAbortController = null;
  structureInFlight = false;
  structureQueued = false;
}

function scheduleNextStructureAt(set: (partial: Partial<AiNotesState>) => void) {
  set({ nextStructureAt: Date.now() + AI_NOTES_STRUCTURE_INTERVAL_MS });
}

async function runStructureTick(
  get: () => AiNotesState,
  set: (partial: Partial<AiNotesState> | ((state: AiNotesState) => Partial<AiNotesState>)) => void,
  options?: { allowInactive?: boolean },
) {
  if (!get().active && !options?.allowInactive) return;

  const transcript = buildTranscript(get().lines, get().interimText);
  if (!transcript) {
    if (get().active) scheduleNextStructureAt(set);
    return;
  }

  if (structureInFlight) {
    structureQueued = true;
    return;
  }

  structureInFlight = true;
  set({ structuring: true, structureError: null });
  structureAbortController = new AbortController();

  try {
    const html = await structureAiNotesTranscript({
      transcript,
      previousHtml: get().structuredHtml || undefined,
      workspaceId: get().workspaceId ?? undefined,
      signal: structureAbortController.signal,
    });

    set({
      structuredHtml: html,
      structuring: false,
      structureError: null,
    });
    if (get().active) scheduleNextStructureAt(set);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    const message =
      error instanceof Error ? error.message : "Structuration IA indisponible.";
    set({ structuring: false, structureError: message });
    if (get().active) scheduleNextStructureAt(set);
  } finally {
    structureInFlight = false;
    structureAbortController = null;
    if (structureQueued && get().active) {
      structureQueued = false;
      void runStructureTick(get, set);
    }
  }
}

function startStructureLoop(
  get: () => AiNotesState,
  set: (partial: Partial<AiNotesState> | ((state: AiNotesState) => Partial<AiNotesState>)) => void,
) {
  clearStructureLoop();
  scheduleNextStructureAt(set);
  structureIntervalId = window.setInterval(() => {
    void runStructureTick(get, set);
  }, AI_NOTES_STRUCTURE_INTERVAL_MS);
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
    if (!get().active && !get().busy) return;

    const { lines, interimText, sessionId, structuredHtml } = get();
    const transcript = buildTranscript(lines, interimText);

    clearStructureLoop();
    set({ busy: true, active: false, nextStructureAt: null });

    try {
      const { blob } = await stopVoiceNotesSession();

      if (sessionId && blob && blob.size > 0) {
        await saveRecordingBlob(sessionId, blob);
      }

      if (transcript) {
        await runStructureTick(get, set, { allowInactive: true });
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
      );

      set({
        active: true,
        busy: false,
        lines: [],
        interimText: "",
        startedAt: Date.now(),
        workspaceId,
        sessionId,
      });

      startStructureLoop(get, set);
    } catch (error) {
      clearStructureLoop();
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
}));
