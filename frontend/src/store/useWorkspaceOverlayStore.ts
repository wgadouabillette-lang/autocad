import { create } from "zustand";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";

export type WorkspaceQuickMenuView = "menu" | "create" | "join";

interface WorkspaceOverlayState {
  panelOpen: boolean;
  anchorEl: HTMLElement | null;
  quickMenuOpen: boolean;
  quickMenuAnchorEl: HTMLElement | null;
  quickMenuView: WorkspaceQuickMenuView;
  setAnchorEl: (el: HTMLElement | null) => void;
  setQuickMenuAnchorEl: (el: HTMLElement | null) => void;
  togglePanel: () => void;
  closePanel: () => void;
  toggleQuickMenu: () => void;
  closeQuickMenu: () => void;
  setQuickMenuView: (view: WorkspaceQuickMenuView) => void;
}

export const useWorkspaceOverlayStore = create<WorkspaceOverlayState>((set, get) => ({
  panelOpen: false,
  anchorEl: null,
  quickMenuOpen: false,
  quickMenuAnchorEl: null,
  quickMenuView: "menu",

  setAnchorEl: (el) => set({ anchorEl: el }),

  setQuickMenuAnchorEl: (el) => set({ quickMenuAnchorEl: el }),

  togglePanel: () => {
    const next = !get().panelOpen;
    if (next) {
      closePanelsOnSide("left", "workspace");
      set({ quickMenuOpen: false, quickMenuView: "menu" });
    }
    set({ panelOpen: next });
  },

  closePanel: () => set({ panelOpen: false }),

  toggleQuickMenu: () => {
    const next = !get().quickMenuOpen;
    if (next) {
      closePanelsOnSide("left", "workspace");
      set({ panelOpen: false, quickMenuView: "menu" });
    }
    set({ quickMenuOpen: next });
  },

  closeQuickMenu: () => set({ quickMenuOpen: false, quickMenuView: "menu" }),

  setQuickMenuView: (view) => set({ quickMenuView: view }),
}));
