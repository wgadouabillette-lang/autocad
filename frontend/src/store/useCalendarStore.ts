import { create } from "zustand";
import type { DayScheduleEvent } from "../lib/daySchedule";
import type { GoogleCalendarEvent } from "../lib/calendarSync";
import type { OutlookCalendarEvent } from "../lib/outlookCalendarSync";

export interface CalendarEvent extends DayScheduleEvent {
  dateKey: string;
  source?: "follow-up" | "user" | "manage-skill" | "meeting-skill" | "google" | "outlook";
  googleEventId?: string;
  outlookEventId?: string;
}

interface CalendarState {
  userEvents: CalendarEvent[];
  googleEvents: CalendarEvent[];
  outlookEvents: CalendarEvent[];
  eventsForDate: (dateKey: string) => DayScheduleEvent[];
  calendarEventsForDate: (dateKey: string) => CalendarEvent[];
  findCalendarEvent: (id: string) => CalendarEvent | undefined;
  addEvents: (events: CalendarEvent[]) => void;
  setUserEvents: (events: CalendarEvent[]) => void;
  removeCalendarEvent: (id: string) => void;
  setGoogleEvents: (events: GoogleCalendarEvent[], dateKey: string) => void;
  setOutlookEvents: (events: OutlookCalendarEvent[], dateKey: string) => void;
}

function mapGoogleEvents(events: GoogleCalendarEvent[]): CalendarEvent[] {
  return events.map((event) => ({
    id: `google-${event.id}`,
    googleEventId: event.id,
    dateKey: event.dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    title: event.title,
    detail: event.detail,
    source: "google" as const,
  }));
}

function mapOutlookEvents(events: OutlookCalendarEvent[]): CalendarEvent[] {
  return events.map((event) => ({
    id: `outlook-${event.id}`,
    outlookEventId: event.id,
    dateKey: event.dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    title: event.title,
    detail: event.detail,
    source: "outlook" as const,
  }));
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  userEvents: [],
  googleEvents: [],
  outlookEvents: [],

  eventsForDate: (dateKey) => {
    const local = get()
      .userEvents.filter((e) => e.dateKey === dateKey)
      .map(({ id, startMinutes, endMinutes, title, detail }) => ({
        id,
        startMinutes,
        endMinutes,
        title,
        detail,
      }));

    const google = get()
      .googleEvents.filter((e) => e.dateKey === dateKey)
      .map(({ id, startMinutes, endMinutes, title, detail }) => ({
        id,
        startMinutes,
        endMinutes,
        title,
        detail,
      }));

    const outlook = get()
      .outlookEvents.filter((e) => e.dateKey === dateKey)
      .map(({ id, startMinutes, endMinutes, title, detail }) => ({
        id,
        startMinutes,
        endMinutes,
        title,
        detail,
      }));

    return [...local, ...google, ...outlook].sort((a, b) => a.startMinutes - b.startMinutes);
  },

  calendarEventsForDate: (dateKey) => {
    const user = get().userEvents.filter((e) => e.dateKey === dateKey);
    const linkedGoogleIds = new Set(
      user.map((event) => event.googleEventId).filter((id): id is string => Boolean(id)),
    );
    const linkedOutlookIds = new Set(
      user.map((event) => event.outlookEventId).filter((id): id is string => Boolean(id)),
    );
    const google = get()
      .googleEvents.filter(
        (e) =>
          e.dateKey === dateKey &&
          !(e.googleEventId && linkedGoogleIds.has(e.googleEventId)) &&
          !linkedGoogleIds.has(e.id.startsWith("google-") ? e.id.slice("google-".length) : e.id),
      );
    const outlook = get()
      .outlookEvents.filter(
        (e) =>
          e.dateKey === dateKey &&
          !(e.outlookEventId && linkedOutlookIds.has(e.outlookEventId)) &&
          !linkedOutlookIds.has(e.id.startsWith("outlook-") ? e.id.slice("outlook-".length) : e.id),
      );
    return [...user, ...google, ...outlook].sort((a, b) => a.startMinutes - b.startMinutes);
  },

  findCalendarEvent: (id) => {
    const all = [...get().userEvents, ...get().googleEvents, ...get().outlookEvents];
    return all.find((event) => event.id === id);
  },

  addEvents: (events) =>
    set((s) => ({
      userEvents: [...s.userEvents, ...events],
    })),

  setUserEvents: (events) => set({ userEvents: events }),

  removeCalendarEvent: (id) =>
    set((s) => ({
      userEvents: s.userEvents.filter((event) => event.id !== id),
      googleEvents: s.googleEvents.filter((event) => event.id !== id),
      outlookEvents: s.outlookEvents.filter((event) => event.id !== id),
    })),

  setGoogleEvents: (events: GoogleCalendarEvent[], dateKey: string) =>
    set((s) => ({
      googleEvents: [
        ...s.googleEvents.filter((event) => event.dateKey !== dateKey),
        ...mapGoogleEvents(events),
      ],
    })),

  setOutlookEvents: (events: OutlookCalendarEvent[], dateKey: string) =>
    set((s) => ({
      outlookEvents: [
        ...s.outlookEvents.filter((event) => event.dateKey !== dateKey),
        ...mapOutlookEvents(events),
      ],
    })),
}));
