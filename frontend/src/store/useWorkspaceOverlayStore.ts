import { create } from "zustand";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";

interface WorkspaceOverlayState {
  panelOpen: boolean;
  togglePanel: () => void;
  closePanel: () => void;
}

export const useWorkspaceOverlayStore = create<WorkspaceOverlayState>((set, get) => ({
  panelOpen: false,

  togglePanel: () => {
    const next = !get().panelOpen;
    if (next) closePanelsOnSide("left", "workspace");
    set({ panelOpen: next });
  },

  closePanel: () => set({ panelOpen: false }),
}));
