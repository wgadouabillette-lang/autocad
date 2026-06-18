import { getAuthIdToken } from "./firebase/authToken";
import type { CalendarSyncEvent, CalendarSyncResult } from "./calendarSync";

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
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(year!, month! - 1, day!, 0, 0, 0, 0);
  const end = new Date(year!, month! - 1, day!, 23, 59, 59, 999);
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

export async function fetchOutlookCalendarEvents(dateKey: string): Promise<OutlookCalendarEvent[]> {
  const { timeMin, timeMax } = dayRangeIso(dateKey);
  const params = new URLSearchParams({ timeMin, timeMax });
  const r = await fetch(`${BASE}/events?${params.toString()}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { events?: OutlookCalendarEvent[]; reason?: string };
  if (data.reason === "not_connected") return [];
  return data.events ?? [];
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
