import { formatScheduleTime, isValidDate, parseDateKey } from "./daySchedule";
import type { CalendarEvent } from "../store/useCalendarStore";
import { useNotificationsStore } from "../store/useNotificationsStore";

export type MeetingReminderOffset = "1h" | "15m";

const FIRED_KEY_PREFIX = "forma-meeting-reminders-fired:";
const REMINDER_OFFSETS: { offset: MeetingReminderOffset; minutes: number }[] = [
  { offset: "1h", minutes: 60 },
  { offset: "15m", minutes: 15 },
];
/** Grace window after the reminder target time (covers 30s polling interval). */
const CHECK_GRACE_MS = 2 * 60 * 1000;

function storageKey(email: string | null): string {
  return `${FIRED_KEY_PREFIX}${email?.trim().toLowerCase() || "default"}`;
}

function loadFiredSet(email: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markFired(email: string | null, key: string): void {
  const fired = loadFiredSet(email);
  if (fired.has(key)) return;
  fired.add(key);
  try {
    localStorage.setItem(storageKey(email), JSON.stringify([...fired]));
  } catch {
    // ignore quota / private mode
  }
}

function eventStartMs(event: CalendarEvent): number | null {
  const date = parseDateKey(event.dateKey);
  if (!isValidDate(date)) return null;
  return date.getTime() + event.startMinutes * 60 * 1000;
}

function reminderBody(offset: MeetingReminderOffset, event: CalendarEvent): string {
  const time = formatScheduleTime(event.startMinutes);
  if (offset === "1h") {
    return `« ${event.title} » commence dans 1 heure (${time}).`;
  }
  return `« ${event.title} » commence dans 15 minutes (${time}).`;
}

export function checkMeetingReminders(email: string | null, events: CalendarEvent[]): void {
  const now = Date.now();
  const fired = loadFiredSet(email);
  const push = useNotificationsStore.getState().push;

  for (const event of events) {
    const startMs = eventStartMs(event);
    if (startMs === null || startMs <= now) continue;

    for (const { offset, minutes } of REMINDER_OFFSETS) {
      const firedKey = `${event.id}:${offset}`;
      if (fired.has(firedKey)) continue;

      const targetMs = startMs - minutes * 60 * 1000;
      if (now < targetMs || now >= targetMs + CHECK_GRACE_MS) continue;

      push({
        id: `meeting-reminder-${event.id}-${offset}`,
        kind: "meeting",
        category: "Calendar",
        title: offset === "1h" ? "Réunion dans 1 heure" : "Réunion dans 15 minutes",
        body: reminderBody(offset, event),
      });
      markFired(email, firedKey);
      fired.add(firedKey);
    }
  }
}
