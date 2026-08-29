import { create } from "zustand";

export type ProCheckoutPlan = "pro" | "proPlus";

interface ProCheckoutState {
  open: boolean;
  plan: ProCheckoutPlan;
  openCheckout: (plan?: ProCheckoutPlan) => void;
  closeCheckout: () => void;
}

export const useProCheckoutStore = create<ProCheckoutState>((set) => ({
  open: false,
  plan: "pro",
  openCheckout: (plan = "pro") => set({ open: true, plan }),
  closeCheckout: () => set({ open: false }),
}));
