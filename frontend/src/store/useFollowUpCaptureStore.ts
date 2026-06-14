import { create } from "zustand";
import { buildCallFollowUpContext } from "../lib/followUps";
import {
  isFollowUpCaptureSupported,
  startFollowUpCapture,
  stopFollowUpCapture,
} from "../lib/voiceFollowUpCapture";
import { saveRecordingBlob } from "../lib/recordingsStorage";
import { useCallsStore } from "./useCallsStore";
import { useFollowUpsStore } from "./useFollowUpsStore";
import { useStore } from "./useStore";

interface FollowUpCaptureState {
  active: boolean;
  busy: boolean;
  transcriptLines: string[];
  workspaceId: string | null;
  captureId: string | null;

  toggle: (workspaceId: string) => Promise<void>;
  stopAndProcess: () => Promise<void>;
}

function isInVoiceSession(workspaceId: string): boolean {
  const calls = useCallsStore.getState();
  const mode = calls.getCallsViewMode(workspaceId);
  return (
    calls.isLocalInCall(workspaceId) ||
    (mode === "theater" && calls.isLocalInTheaterCall(workspaceId))
  );
}

export const useFollowUpCaptureStore = create<FollowUpCaptureState>((set, get) => ({
  active: false,
  busy: false,
  transcriptLines: [],
  workspaceId: null,
  captureId: null,

  stopAndProcess: async () => {
    if (!get().active && !get().busy) return;

    const { workspaceId, transcriptLines, captureId } = get();
    set({ busy: true, active: false });

    try {
      const { blob, durationMs } = await stopFollowUpCapture();
      const transcript = transcriptLines.join("\n").trim();

      if (captureId && blob && blob.size > 0) {
        await saveRecordingBlob(captureId, blob);
      }

      if (workspaceId) {
        const ctx = buildCallFollowUpContext(workspaceId);
        useFollowUpsStore.getState().openReviewFromCapture({
          ...ctx,
          transcript,
          durationMs,
          recording: Boolean(blob && blob.size > 0),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de traiter le follow-up.";
      useFollowUpsStore.getState().openReviewError(message);
    }

    set({
      busy: false,
      transcriptLines: [],
      workspaceId: null,
      captureId: null,
    });
  },

  toggle: async (workspaceId) => {
    if (get().busy) return;

    if (get().active) {
      await get().stopAndProcess();
      return;
    }

    if (!isFollowUpCaptureSupported()) {
      useFollowUpsStore
        .getState()
        .openReviewError("L'enregistrement audio n'est pas disponible dans ce navigateur.");
      return;
    }

    set({ busy: true });

    try {
      if (!isInVoiceSession(workspaceId)) {
        await useCallsStore.getState().joinCall(workspaceId);
      }

      const captureId = `followup-${Date.now()}`;
      const transcriptLines: string[] = [];

      await startFollowUpCapture((line) => {
        transcriptLines.push(line);
        set({ transcriptLines: [...transcriptLines] });
      });

      useStore.getState().openFollowUpPanel();

      set({
        active: true,
        busy: false,
        transcriptLines,
        workspaceId,
        captureId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Impossible de démarrer le follow-up.";
      useFollowUpsStore.getState().openReviewError(message);
      set({
        active: false,
        busy: false,
        transcriptLines: [],
        workspaceId: null,
        captureId: null,
      });
    }
  },
}));
