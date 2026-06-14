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

export async function syncEventsToGoogleCalendar(
  events: CalendarSyncEvent[],
): Promise<CalendarSyncResult> {
  if (events.length === 0) {
    return { synced: false, created: 0, reason: "no_events" };
  }

  const r = await fetch("/api/connectors/calendar/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });

  if (!r.ok) {
    const text = await r.text();
    return { synced: false, created: 0, reason: text || `HTTP ${r.status}` };
  }

  return (await r.json()) as CalendarSyncResult;
}
