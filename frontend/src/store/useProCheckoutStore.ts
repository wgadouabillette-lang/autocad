import { create } from "zustand";

interface ProCheckoutState {
  open: boolean;
  openCheckout: () => void;
  closeCheckout: () => void;
}

export const useProCheckoutStore = create<ProCheckoutState>((set) => ({
  open: false,
  openCheckout: () => set({ open: true }),
  closeCheckout: () => set({ open: false }),
}));
