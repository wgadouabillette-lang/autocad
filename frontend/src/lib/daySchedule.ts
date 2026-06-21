export interface DayScheduleEvent {
  id: string;
  startMinutes: number;
  endMinutes: number;
  title: string;
  detail?: string;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

export function defaultFutureDateKey(daysFromNow = 7): string {
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + daysFromNow);
  return toDateKey(fallback);
}

export function isValidDateKey(key: string): boolean {
  const trimmed = key.trim();
  if (!DATE_KEY_RE.test(trimmed)) return false;
  const date = parseDateKey(trimmed);
  return isValidDate(date) && toDateKey(date) === trimmed;
}

/** Normalise une clé YYYY-MM-DD ; fallback silencieux si invalide. */
export function normalizeDateKey(key: string, fallback?: string): string {
  const trimmed = key.trim();
  if (isValidDateKey(trimmed)) return trimmed;
  return fallback ?? defaultFutureDateKey();
}

export interface ParsedManageDeadline {
  dateKey: string;
  deadlineMinutes?: number;
}

const FRENCH_WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

export function minutesFromMidnightLocal(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

function nextWeekdayDate(weekday: number, fromDate: Date, forceNext: boolean): Date {
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);
  const currentWeekday = result.getDay();
  let daysAhead = weekday - currentWeekday;
  if (daysAhead < 0) daysAhead += 7;
  if (daysAhead === 0 && forceNext) daysAhead = 7;
  result.setDate(result.getDate() + daysAhead);
  return result;
}

function extractDeadlineTime(raw: string): { dateText: string; deadlineMinutes?: number } {
  const trimmed = raw.trim();
  const colonMatch = trimmed.match(/\b(\d{1,2}):(\d{2})\b/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes) && hours >= 0 && hours < 24) {
      return {
        dateText: trimmed.replace(colonMatch[0], " ").replace(/\s+/g, " ").trim(),
        deadlineMinutes: hours * 60 + minutes,
      };
    }
  }

  const hourMatch = trimmed.match(/\b(\d{1,2})\s*h(?:pm|am)?(?:\s*(\d{1,2}))?\b/i);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    const extraMinutes = hourMatch[2] ? Number(hourMatch[2]) : 0;
    if (Number.isFinite(hours) && hours >= 0 && hours < 24) {
      return {
        dateText: trimmed.replace(hourMatch[0], " ").replace(/\s+/g, " ").trim(),
        deadlineMinutes: hours * 60 + (Number.isFinite(extraMinutes) ? extraMinutes : 0),
      };
    }
  }

  return { dateText: trimmed };
}

function resolveFrenchWeekdayDate(text: string, fromDate: Date): Date | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!normalized) return null;

  const prochainMatch = normalized.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+prochain\b/,
  );
  if (prochainMatch) {
    const weekday = FRENCH_WEEKDAYS[prochainMatch[1]!];
    if (weekday != null) return nextWeekdayDate(weekday, fromDate, true);
  }

  const weekdayMatch = normalized.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/);
  if (weekdayMatch) {
    const weekday = FRENCH_WEEKDAYS[weekdayMatch[1]!];
    if (weekday != null) return nextWeekdayDate(weekday, fromDate, false);
  }

  return null;
}

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
};

function resolveFrenchDayMonthDate(text: string, fromDate: Date): Date | null {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const match = normalized.match(
    /^(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?$/,
  );
  if (!match) return null;

  const day = Number(match[1]);
  const month = FRENCH_MONTHS[match[2]!];
  if (month == null || day < 1 || day > 31) return null;

  const year = match[3] ? Number(match[3]) : fromDate.getFullYear();
  const candidate = new Date(year, month, day);
  if (!isValidDate(candidate) || candidate.getDate() !== day) return null;

  if (!match[3]) {
    const today = new Date(fromDate);
    today.setHours(0, 0, 0, 0);
    if (candidate < today) {
      candidate.setFullYear(year + 1);
    }
  }

  return candidate;
}

/**
 * Interprète une deadline utilisateur (YYYY-MM-DD, jour de la semaine FR, heure optionnelle).
 */
export function parseManageDeadline(raw: string, fallbackDays = 7): ParsedManageDeadline {
  const fallback = defaultFutureDateKey(fallbackDays);
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "YYYY-MM-DD" || /^deadline$/i.test(trimmed)) {
    return { dateKey: fallback };
  }

  const { dateText, deadlineMinutes } = extractDeadlineTime(trimmed);
  const dateCandidate = dateText || trimmed;

  if (isValidDateKey(dateCandidate)) {
    return { dateKey: dateCandidate, deadlineMinutes };
  }

  const parsedMs = Date.parse(dateCandidate);
  if (Number.isFinite(parsedMs)) {
    const parsed = new Date(parsedMs);
    if (isValidDate(parsed)) {
      return { dateKey: toDateKey(parsed), deadlineMinutes };
    }
  }

  const frenchDate = resolveFrenchWeekdayDate(dateCandidate, new Date());
  if (frenchDate && isValidDate(frenchDate)) {
    return { dateKey: toDateKey(frenchDate), deadlineMinutes };
  }

  const frenchDayMonth = resolveFrenchDayMonthDate(dateCandidate, new Date());
  if (frenchDayMonth && isValidDate(frenchDayMonth)) {
    return { dateKey: toDateKey(frenchDayMonth), deadlineMinutes };
  }

  return { dateKey: fallback, deadlineMinutes };
}

/**
 * Interprète une deadline utilisateur (YYYY-MM-DD, langage naturel, placeholder)
 * en clé calendrier valide, avec repli today+N jours.
 */
export function coerceDateKey(raw: string, fallbackDays = 7): string {
  return parseManageDeadline(raw, fallbackDays).dateKey;
}

export function toDateKey(date: Date): string {
  if (!isValidDate(date)) return defaultFutureDateKey(0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const trimmed = key.trim();
  if (!DATE_KEY_RE.test(trimmed)) return new Date(NaN);
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return new Date(NaN);
  }
  const date = new Date(y, m - 1, d);
  if (
    !isValidDate(date) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return new Date(NaN);
  }
  return date;
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
  const safeKey = normalizeDateKey(dateKey);
  const parsed = parseDateKey(safeKey);
  if (!isValidDate(parsed)) return safeKey;
  try {
    const label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(parsed);
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return safeKey;
  }
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
