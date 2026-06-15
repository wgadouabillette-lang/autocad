import { create } from "zustand";
import type { DayScheduleEvent } from "../lib/daySchedule";

export interface CalendarEvent extends DayScheduleEvent {
  dateKey: string;
  source?: "follow-up" | "user" | "manage-skill";
}

interface CalendarState {
  userEvents: CalendarEvent[];
  eventsForDate: (dateKey: string) => DayScheduleEvent[];
  addEvents: (events: CalendarEvent[]) => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  userEvents: [],

  eventsForDate: (dateKey) => {
    return get()
      .userEvents.filter((e) => e.dateKey === dateKey)
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map(({ id, startMinutes, endMinutes, title, detail }) => ({
        id,
        startMinutes,
        endMinutes,
        title,
        detail,
      }));
  },

  addEvents: (events) =>
    set((s) => ({
      userEvents: [...s.userEvents, ...events],
    })),
}));
