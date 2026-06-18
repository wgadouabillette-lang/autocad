import { create } from "zustand";
import {
  generateRecapNote,
  recapProcessingLabel,
  resolveRecapBlob,
  type RecapComposerDraft,
} from "../lib/recapSkill";
import { useStore } from "./useStore";

interface RecapStore {
  composerDraft: RecapComposerDraft | null;
  generating: boolean;
  generatingLabel: string;
  noteReveal: boolean;
  error: string | null;
  setComposerDraft: (draft: RecapComposerDraft | null) => void;
  clearComposerDraft: () => void;
  submitRecap: () => Promise<void>;
  resetReveal: () => void;
}

export const useRecapStore = create<RecapStore>((set, get) => ({
  composerDraft: null,
  generating: false,
  generatingLabel: "Creating your recap note…",
  noteReveal: false,
  error: null,

  setComposerDraft: (draft) => set({ composerDraft: draft, error: null }),

  clearComposerDraft: () => set({ composerDraft: null }),

  resetReveal: () => set({ noteReveal: false }),

  submitRecap: async () => {
    const draft = get().composerDraft;
    if (!draft) return;

    set({ generating: true, error: null, noteReveal: true, generatingLabel: "Preparing…" });

    const store = useStore.getState();
    store.startNewManualNote();
    store.openAiNotesPanel();

    try {
      const source = await resolveRecapBlob(draft);
      set({
        generatingLabel: recapProcessingLabel(source.blob.size, source.durationMs),
      });

      const result = await generateRecapNote({
        blob: source.blob,
        filename: source.filename,
        title: source.title,
        durationMs: source.durationMs,
      });

      const session = store.saveManualNote({
        title: result.title,
        body: result.bodyHtml,
      });

      if (session) {
        store.openManualNote(session.id);
      }

      set({
        generating: false,
        composerDraft: null,
        generatingLabel: "Recap ready",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not generate recap.";
      set({
        generating: false,
        error: message,
        generatingLabel: message,
      });
    }
  },
}));
