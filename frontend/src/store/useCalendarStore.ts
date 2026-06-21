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
  addEvents: (events: CalendarEvent[]) => void;
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

  addEvents: (events) =>
    set((s) => ({
      userEvents: [...s.userEvents, ...events],
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
