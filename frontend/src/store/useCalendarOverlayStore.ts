import { create } from "zustand";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";
import { toDateKey } from "../lib/daySchedule";
import { useStore } from "./useStore";

interface CalendarOverlayState {
  selectedDate: string;
  composerOpen: boolean;
  composerInitialHour: number | null;
  composerInitialDate: string | null;
  togglePanel: () => void;
  setSelectedDate: (dateKey: string) => void;
  goToToday: () => void;
  openComposer: (initialHour?: number) => void;
  closeComposer: () => void;
}

export const useCalendarOverlayStore = create<CalendarOverlayState>((set, get) => ({
  selectedDate: toDateKey(new Date()),
  composerOpen: false,
  composerInitialHour: null,
  composerInitialDate: null,

  togglePanel: () => {
    const { chatPanelOpen, chatPanelMode, closeChatPanel, openCalendarPanel } =
      useStore.getState();
    if (chatPanelOpen && chatPanelMode === "calendar") {
      closeChatPanel();
      return;
    }
    closePanelsOnSide("right", "calendar");
    openCalendarPanel();
  },

  setSelectedDate: (dateKey) => set({ selectedDate: dateKey }),

  goToToday: () => set({ selectedDate: toDateKey(new Date()) }),

  openComposer: (initialHour) => {
    const { selectedDate } = get();
    set({
      composerOpen: true,
      composerInitialHour: initialHour ?? null,
      composerInitialDate:
        initialHour !== undefined ? selectedDate : toDateKey(new Date()),
    });
  },

  closeComposer: () =>
    set({
      composerOpen: false,
      composerInitialHour: null,
      composerInitialDate: null,
    }),
}));
