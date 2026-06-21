import { getAuthIdToken } from "./firebase/authToken";
import type { CalendarSyncEvent, CalendarSyncResult } from "./calendarSync";
import { isValidDate, normalizeDateKey, parseDateKey } from "./daySchedule";

export interface OutlookCalendarEvent {
  id: string;
  title: string;
  detail?: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

export interface OutlookCalendarStatus {
  connected: boolean;
  configured: boolean;
  accountEmail?: string | null;
}

const BASE = "/api/connectors/outlook/calendar";

async function authHeaders(json = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = await getAuthIdToken(false);
  if (!token) {
    throw new Error("Connectez-vous à l'app avant de synchroniser Outlook.");
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

function dayRangeIso(dateKey: string): { timeMin: string; timeMax: string } {
  const safeKey = normalizeDateKey(dateKey);
  const start = parseDateKey(safeKey);
  start.setHours(0, 0, 0, 0);
  const end = parseDateKey(safeKey);
  end.setHours(23, 59, 59, 999);
  if (!isValidDate(start) || !isValidDate(end)) {
    const fallback = parseDateKey(normalizeDateKey(""));
    fallback.setHours(0, 0, 0, 0);
    const fallbackEnd = new Date(fallback);
    fallbackEnd.setHours(23, 59, 59, 999);
    return {
      timeMin: fallback.toISOString(),
      timeMax: fallbackEnd.toISOString(),
    };
  }
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

export async function fetchOutlookCalendarStatus(): Promise<OutlookCalendarStatus> {
  const r = await fetch(`${BASE}/status`, { headers: await authHeaders() });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  return (await r.json()) as OutlookCalendarStatus;
}

function rangeIso(fromDateKey: string, toDateKey: string): { timeMin: string; timeMax: string } {
  const start = parseDateKey(normalizeDateKey(fromDateKey));
  start.setHours(0, 0, 0, 0);
  const end = parseDateKey(normalizeDateKey(toDateKey));
  end.setHours(23, 59, 59, 999);
  if (!isValidDate(start) || !isValidDate(end)) {
    return dayRangeIso(normalizeDateKey(""));
  }
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

async function fetchOutlookCalendarEventsInRange(
  timeMin: string,
  timeMax: string,
): Promise<OutlookCalendarEvent[]> {
  const params = new URLSearchParams({ timeMin, timeMax });
  const r = await fetch(`${BASE}/events?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { events?: OutlookCalendarEvent[]; reason?: string };
  if (data.reason === "not_connected" || data.reason === "not_configured") return [];
  return data.events ?? [];
}

export async function fetchOutlookCalendarEvents(dateKey: string): Promise<OutlookCalendarEvent[]> {
  const { timeMin, timeMax } = dayRangeIso(dateKey);
  return fetchOutlookCalendarEventsInRange(timeMin, timeMax);
}

export async function fetchOutlookCalendarEventsForRange(
  fromDateKey: string,
  toDateKey: string,
): Promise<OutlookCalendarEvent[]> {
  const { timeMin, timeMax } = rangeIso(fromDateKey, toDateKey);
  return fetchOutlookCalendarEventsInRange(timeMin, timeMax);
}

export async function syncEventsToOutlookCalendar(
  events: CalendarSyncEvent[],
): Promise<CalendarSyncResult> {
  if (events.length === 0) {
    return { synced: false, created: 0, reason: "no_events" };
  }

  const r = await fetch(`${BASE}/events`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify({ events }),
  });

  if (!r.ok) {
    const text = await r.text();
    return { synced: false, created: 0, reason: text || `HTTP ${r.status}` };
  }

  return (await r.json()) as CalendarSyncResult;
}
