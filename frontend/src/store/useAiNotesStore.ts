import { create } from "zustand";
import {
  isVoiceNotesSupported,
  startVoiceNotesSession,
  stopVoiceNotesSession,
  type VoiceNotesTranscriptChunk,
} from "../lib/voiceAiNotesSession";
import { saveRecordingBlob } from "../lib/recordingsStorage";
import { useCallsStore } from "./useCallsStore";
import { useStore } from "./useStore";

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
  error: string | null;
  startedAt: number | null;
  workspaceId: string | null;
  sessionId: string | null;

  toggle: (workspaceId: string) => Promise<void>;
  stop: () => Promise<void>;
}

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

export const useAiNotesStore = create<AiNotesState>((set, get) => ({
  active: false,
  busy: false,
  lines: [],
  interimText: "",
  error: null,
  startedAt: null,
  workspaceId: null,
  sessionId: null,

  stop: async () => {
    if (!get().active && !get().busy) return;

    set({ busy: true });
    const { lines, interimText, workspaceId, sessionId, startedAt } = get();
    const transcript = buildTranscript(lines, interimText);

    try {
      const { blob, durationMs } = await stopVoiceNotesSession();

      if (sessionId && transcript) {
        const messages = transcript
          .split("\n")
          .filter(Boolean)
          .map((text) => ({ role: "assistant" as const, text }));

        useStore.getState().finalizeAiNotesSession({
          sessionId,
          messages,
          durationMs: durationMs || (startedAt ? Date.now() - startedAt : 0),
        });

        if (blob && blob.size > 0) {
          await saveRecordingBlob(sessionId, blob);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'arrêter AI Notes.";
      set({ error: message });
    }

    set({
      active: false,
      busy: false,
      lines: [],
      interimText: "",
      startedAt: null,
      workspaceId: null,
      sessionId: null,
    });
  },

  toggle: async (workspaceId) => {
    if (get().busy) return;

    if (get().active) {
      await get().stop();
      return;
    }

    if (!isVoiceNotesSupported()) {
      set({ error: "La transcription live n'est pas disponible dans ce navigateur." });
      return;
    }

    set({ busy: true, error: null });

    try {
      if (!isInVoiceSession(workspaceId)) {
        await useCallsStore.getState().joinCall(workspaceId);
      }

      const session = useStore.getState().beginAiNotesSession(workspaceId);
      const sessionId = session.id;

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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de démarrer AI Notes.";
      set({
        active: false,
        busy: false,
        error: message,
        lines: [],
        interimText: "",
        startedAt: null,
        workspaceId: null,
        sessionId: null,
      });
    }
  },
}));
