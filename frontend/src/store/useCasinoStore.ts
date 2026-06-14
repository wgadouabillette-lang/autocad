import { create } from "zustand";

interface CasinoState {
  rouletteOpen: boolean;
  toggleRoulette: () => void;
  closeRoulette: () => void;
}

export const useCasinoStore = create<CasinoState>((set) => ({
  rouletteOpen: false,
  toggleRoulette: () => set((state) => ({ rouletteOpen: !state.rouletteOpen })),
  closeRoulette: () => set({ rouletteOpen: false }),
}));
