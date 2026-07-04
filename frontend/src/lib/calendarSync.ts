import { getAuthIdToken } from "./firebase/authToken";
import { isValidDate, normalizeDateKey, parseDateKey } from "./daySchedule";

export interface CalendarSyncEvent {
  title: string;
  detail?: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

export interface CalendarSyncResult {
  synced: boolean;
  created: number;
  reason?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  detail?: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

export interface GoogleCalendarStatus {
  connected: boolean;
  configured: boolean;
  accountEmail?: string | null;
  authExpired?: boolean;
}

const BASE = "/api/connectors/calendar";

async function authHeaders(json = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = await getAuthIdToken(true);
  if (!token) {
    throw new Error("Connectez-vous à l'app avant de synchroniser le calendrier.");
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

export async function fetchGoogleCalendarStatus(): Promise<GoogleCalendarStatus> {
  const r = await fetch(`${BASE}/status`, { headers: await authHeaders() });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  return (await r.json()) as GoogleCalendarStatus;
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

export async function fetchGoogleCalendarEventsInRange(
  timeMin: string,
  timeMax: string,
): Promise<{ events: GoogleCalendarEvent[]; authExpired: boolean }> {
  const params = new URLSearchParams({ timeMin, timeMax });
  const r = await fetch(`${BASE}/events?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      return { events: [], authExpired: true };
    }
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { events?: GoogleCalendarEvent[]; reason?: string };
  if (
    data.reason === "not_connected" ||
    data.reason === "not_configured" ||
    data.reason === "auth_expired"
  ) {
    return { events: [], authExpired: data.reason === "auth_expired" };
  }
  return { events: data.events ?? [], authExpired: false };
}

export async function fetchGoogleCalendarEventsForDate(
  dateKey: string,
): Promise<{ events: GoogleCalendarEvent[]; authExpired: boolean }> {
  const { timeMin, timeMax } = dayRangeIso(dateKey);
  return fetchGoogleCalendarEventsInRange(timeMin, timeMax);
}

export async function fetchGoogleCalendarEvents(dateKey: string): Promise<GoogleCalendarEvent[]> {
  const result = await fetchGoogleCalendarEventsForDate(dateKey);
  return result.events;
}

export async function fetchGoogleCalendarEventsForRange(
  fromDateKey: string,
  toDateKey: string,
): Promise<GoogleCalendarEvent[]> {
  const { timeMin, timeMax } = rangeIso(fromDateKey, toDateKey);
  const result = await fetchGoogleCalendarEventsInRange(timeMin, timeMax);
  return result.events;
}

export async function syncEventsToGoogleCalendar(
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

export async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const safeId = eventId.trim();
  if (!safeId) return;
  await fetch(`${BASE}/events/${encodeURIComponent(safeId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
}
