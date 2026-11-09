import { create } from "zustand";

interface WorkspaceUpgradeState {
  open: boolean;
  openUpgrade: () => void;
  closeUpgrade: () => void;
}

export const useWorkspaceUpgradeStore = create<WorkspaceUpgradeState>((set) => ({
  open: false,
  openUpgrade: () => set({ open: true }),
  closeUpgrade: () => set({ open: false }),
}));
