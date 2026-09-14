import { create } from "zustand";
import { structureAiNotesTranscript } from "../lib/aiNotesStructure";
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

function abortStructure() {
  structureAbortController?.abort();
  structureAbortController = null;
  structureInFlight = false;
}

async function runFinalStructure(
  get: () => AiNotesState,
  set: (partial: Partial<AiNotesState> | ((state: AiNotesState) => Partial<AiNotesState>)) => void,
) {
  const transcript = buildTranscript(get().lines, get().interimText);
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

      if (buildTranscript(get().lines, get().interimText)) {
        await runFinalStructure(get, set);
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
}));
