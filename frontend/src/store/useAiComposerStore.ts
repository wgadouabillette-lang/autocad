import { create } from "zustand";

interface AiComposerState {
  /** Composeur agent actif (focus, texte en cours ou génération IA). */
  engaged: boolean;
  setEngaged: (engaged: boolean) => void;
}

export const useAiComposerStore = create<AiComposerState>((set) => ({
  engaged: false,
  setEngaged: (engaged) => set({ engaged }),
}));
