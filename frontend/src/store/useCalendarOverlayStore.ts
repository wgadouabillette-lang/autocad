import { create } from "zustand";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";
import { toDateKey } from "../lib/daySchedule";
import { useStore } from "./useStore";

interface CalendarOverlayState {
  selectedDate: string;
  composerOpen: boolean;
  composerInitialHour: number | null;
  composerInitialDate: string | null;
  /** Event to scroll into view the next time the day timeline paints. */
  focusEventId: string | null;
  togglePanel: () => void;
  setSelectedDate: (dateKey: string) => void;
  revealAddedEvent: (dateKey: string, eventId: string | null) => void;
  clearFocusEvent: () => void;
  goToToday: () => void;
  openComposer: (initialHour?: number) => void;
  closeComposer: () => void;
}

export const useCalendarOverlayStore = create<CalendarOverlayState>((set, get) => ({
  selectedDate: toDateKey(new Date()),
  composerOpen: false,
  composerInitialHour: null,
  composerInitialDate: null,
  focusEventId: null,

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

  revealAddedEvent: (dateKey, eventId) =>
    set({ selectedDate: dateKey, focusEventId: eventId }),

  clearFocusEvent: () => set({ focusEventId: null }),

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
