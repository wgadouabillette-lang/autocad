import { create } from "zustand";

interface EnterpriseCheckoutState {
  open: boolean;
  preferredWorkspaceId: string | null;
  openCheckout: (opts?: { preferredWorkspaceId?: string | null }) => void;
  closeCheckout: () => void;
}

export const useEnterpriseCheckoutStore = create<EnterpriseCheckoutState>((set) => ({
  open: false,
  preferredWorkspaceId: null,
  openCheckout: (opts) =>
    set({
      open: true,
      preferredWorkspaceId: opts?.preferredWorkspaceId?.trim().toLowerCase() || null,
    }),
  closeCheckout: () => set({ open: false, preferredWorkspaceId: null }),
}));
