export interface DayScheduleEvent {
  id: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  detail?: string;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isTodayKey(dateKey: string): boolean {
  return dateKey === toDateKey(new Date());
}

export function formatScheduleTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDayLabel(dateKey: string): string {
  const label = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parseDateKey(dateKey));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** @deprecated Use formatDayLabel(toDateKey(new Date())) */
export function formatTodayLabel(date = new Date()): string {
  return formatDayLabel(toDateKey(date));
}

export type DayEventStatus = "past" | "now" | "upcoming";

export function eventStatusForDay(
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
): DayEventStatus {
  if (!isTodayKey(dateKey)) {
    return dateKey < toDateKey(new Date()) ? "past" : "upcoming";
  }
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  if (current >= endMinutes) return "past";
  if (current >= startMinutes && current < endMinutes) return "now";
  return "upcoming";
}
