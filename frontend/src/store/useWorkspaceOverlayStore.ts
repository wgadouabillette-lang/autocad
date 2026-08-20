import { create } from "zustand";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";

export type WorkspaceQuickMenuView = "menu" | "create" | "join";

const CLOSE_DELAY_MS = 220;

let closePanelTimer: number | null = null;

function clearClosePanelTimer() {
  if (closePanelTimer !== null) {
    window.clearTimeout(closePanelTimer);
    closePanelTimer = null;
  }
}

interface WorkspaceOverlayState {
  panelOpen: boolean;
  anchorEl: HTMLElement | null;
  quickMenuOpen: boolean;
  quickMenuAnchorEl: HTMLElement | null;
  quickMenuView: WorkspaceQuickMenuView;
  setAnchorEl: (el: HTMLElement | null) => void;
  setQuickMenuAnchorEl: (el: HTMLElement | null) => void;
  openPanel: () => void;
  togglePanel: () => void;
  closePanel: () => void;
  /** Cancel a pending hover-leave close (mouse re-entered stroke or panel). */
  cancelScheduledClose: () => void;
  /** Close after a short delay — used when leaving the edge/panel hover pair. */
  scheduleClosePanel: () => void;
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

  openPanel: () => {
    clearClosePanelTimer();
    if (get().panelOpen) return;
    closePanelsOnSide("left", "workspace");
    set({ panelOpen: true, quickMenuOpen: false, quickMenuView: "menu" });
  },

  togglePanel: () => {
    const next = !get().panelOpen;
    clearClosePanelTimer();
    if (next) {
      closePanelsOnSide("left", "workspace");
      set({ quickMenuOpen: false, quickMenuView: "menu" });
    }
    set({ panelOpen: next });
  },

  closePanel: () => {
    clearClosePanelTimer();
    set({ panelOpen: false });
  },

  cancelScheduledClose: () => {
    clearClosePanelTimer();
  },

  scheduleClosePanel: () => {
    clearClosePanelTimer();
    closePanelTimer = window.setTimeout(() => {
      closePanelTimer = null;
      set({ panelOpen: false });
    }, CLOSE_DELAY_MS);
  },

  toggleQuickMenu: () => {
    const next = !get().quickMenuOpen;
    if (next) {
      clearClosePanelTimer();
      closePanelsOnSide("left", "workspace");
      set({ panelOpen: false, quickMenuView: "menu" });
    }
    set({ quickMenuOpen: next });
  },

  closeQuickMenu: () => set({ quickMenuOpen: false, quickMenuView: "menu" }),

  setQuickMenuView: (view) => set({ quickMenuView: view }),
}));
