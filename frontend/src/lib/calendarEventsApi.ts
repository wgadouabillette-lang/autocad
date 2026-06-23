import { getAuthIdToken } from "./firebase/authToken";
import type { CalendarSyncEvent } from "./calendarSync";
import type { CalendarEvent } from "../store/useCalendarStore";

const BASE = "/api/calendar/user-events";

async function authHeaders(json = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = await getAuthIdToken(true);
  if (!token) {
    throw new Error("Connectez-vous à l'app avant d'utiliser le calendrier.");
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

export interface PersistedCalendarEventPayload {
  id: string;
  title: string;
  detail?: string | null;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
  source?: string;
  googleEventId?: string | null;
  outlookEventId?: string | null;
  endsAt?: number;
  createdAt?: number;
}

function toCalendarEvent(event: PersistedCalendarEventPayload): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    detail: event.detail ?? undefined,
    dateKey: event.dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    source: (event.source as CalendarEvent["source"]) ?? "user",
    googleEventId: event.googleEventId ?? undefined,
    outlookEventId: event.outlookEventId ?? undefined,
  };
}

export async function fetchUserCalendarEvents(): Promise<CalendarEvent[]> {
  const r = await fetch(BASE, { headers: await authHeaders() });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { events?: PersistedCalendarEventPayload[] };
  return (data.events ?? []).map(toCalendarEvent);
}

export async function createUserCalendarEvents(
  events: CalendarSyncEvent[],
  source: CalendarEvent["source"] = "user",
): Promise<CalendarEvent[]> {
  if (events.length === 0) return [];
  const r = await fetch(BASE, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify({ events, source }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  const data = (await r.json()) as { events?: PersistedCalendarEventPayload[] };
  return (data.events ?? []).map(toCalendarEvent);
}

export async function deleteUserCalendarEvent(eventId: string): Promise<void> {
  const r = await fetch(`${BASE}/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!r.ok && r.status !== 404) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
}

export async function refreshPersistedCalendarEvents(): Promise<CalendarEvent[]> {
  const events = await fetchUserCalendarEvents();
  return events;
}
