import { getAuthIdToken } from "./firebase/authToken";

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
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year!, month! - 1, day!, 0, 0, 0, 0);
  const end = new Date(year!, month! - 1, day!, 23, 59, 59, 999);
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

export async function fetchGoogleCalendarEvents(dateKey: string): Promise<GoogleCalendarEvent[]> {
  const { timeMin, timeMax } = dayRangeIso(dateKey);
  const params = new URLSearchParams({ timeMin, timeMax });
  const r = await fetch(`${BASE}/events?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { events?: GoogleCalendarEvent[]; reason?: string };
  if (data.reason === "not_connected") return [];
  return data.events ?? [];
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
