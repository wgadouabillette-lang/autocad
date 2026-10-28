import { api } from "./api";
import {
  defaultFutureDateKey,
  formatDayLabel,
  formatScheduleTime,
  isValidDateKey,
  parseManageDeadline,
  toDateKey,
} from "./daySchedule";
import { isMailSendRequest } from "./mailIntent";
import { isNaturalLanguageManageRequest } from "./manageSchedulePrompt";

export interface CalendarAddDraft {
  title: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

const CALENDAR_WORD_RE = /\b(calendrier|calendar|agenda|planning|horaire|emploi du temps)\b/i;
const EVENT_WORD_RE =
  /\b(rendez[-\s]?vous|rdv|appointment|evenement|événement|creneau|créneau)\b/i;
const ADD_VERB_RE =
  /\b(ajout\w*|ajoute|ajouter|mets|met|mettre|note|noter|bloque\w*|reserv\w*|réserv\w*|planifi\w*|cr[eé]\w*|add|put|book|schedule|create)\b/i;
const TIME_RE =
  /\b(\d{1,2}\s*h(?:\s*\d{1,2})?|\d{1,2}:\d{2}|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;
const RELATIVE_DAY_WORD: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
};
const RELATIVE_DAY_RE =
  /\bdans\s+(\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+jours?\b/i;
const DATE_RE =
  /\b(demain|tomorrow|aujourd'hui|aujourdhui|today|ce soir|tonight|dans\s+(?:\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+jours?|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?|\d{1,2}\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december))\b/i;
const PLAY_INTENT_RE =
  /\b(joue|jouer|play|écout\w*|ecout\w*|listen|chanson|spotify|fais jouer|fait jouer|put on|mets-moi|met-moi|balance)\b/i;
const PLAY_LEADING_RE =
  /^(?:mets|met|lance|balance)\s+(?!dans\b|sur\s+(?:mon\s+|ma\s+|le\s+)?(?:calendrier|agenda|calendar|planning)\b).+/i;

const FR_WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

const EN_WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const FR_MONTHS: Record<string, number> = {
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

const EN_MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Relie une suite (« vendredi à 9h, dentiste ») à la demande d'horaire, sans l'historique du chat. */
export function prepareCalendarText(text: string): string {
  let plain = stripAccents(text);
  plain = plain
    .replace(/\bqui s['’]?en vient\b/gi, "prochain")
    .replace(/\bvenderdi\b/gi, "vendredi")
    .replace(/\bvendredy\b/gi, "vendredi")
    .replace(/\bmercedi\b/gi, "mercredi")
    .replace(/\bjeudy\b/gi, "jeudi")
    .replace(/\bsamdi\b/gi, "samedi");
  return plain;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function hasTime(text: string): boolean {
  return TIME_RE.test(prepareCalendarText(text));
}

function hasDate(text: string): boolean {
  return DATE_RE.test(prepareCalendarText(text));
}

function nextWeekday(weekday: number, forceNext: boolean): string {
  const result = new Date();
  result.setHours(0, 0, 0, 0);
  let daysAhead = weekday - result.getDay();
  if (daysAhead < 0) daysAhead += 7;
  if (daysAhead === 0 && forceNext) daysAhead = 7;
  result.setDate(result.getDate() + daysAhead);
  return toDateKey(result);
}

function dateFromDayMonth(day: number, month: number, year?: number): string | null {
  if (day < 1 || day > 31 || month < 0 || month > 11) return null;
  const now = new Date();
  const resolvedYear = year ?? now.getFullYear();
  const candidate = new Date(resolvedYear, month, day);
  if (candidate.getMonth() !== month || candidate.getDate() !== day) return null;
  if (year == null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (candidate < today) candidate.setFullYear(resolvedYear + 1);
  }
  return toDateKey(candidate);
}

export function findCalendarDateKey(text: string): string | null {
  const plain = prepareCalendarText(text).toLowerCase();
  if (/\bdemain\b|\btomorrow\b/.test(plain)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return toDateKey(date);
  }
  if (/\baujourd'hui\b|\baujourdhui\b|\btoday\b|\bce soir\b|\btonight\b/.test(plain)) {
    return toDateKey(new Date());
  }

  const relative = plain.match(RELATIVE_DAY_RE);
  if (relative) {
    const token = relative[1]!;
    const days = /^\d+$/.test(token) ? Number(token) : RELATIVE_DAY_WORD[token];
    if (days != null && days >= 0 && days <= 366) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return toDateKey(date);
    }
  }

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso && isValidDateKey(iso[1]!)) return iso[1]!;

  const slash = text.match(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    const rawYear = slash[3] ? Number(slash[3]) : undefined;
    const year = rawYear != null && rawYear < 100 ? 2000 + rawYear : rawYear;
    const key = dateFromDayMonth(day, month, year);
    if (key) return key;
  }

  const frMonth = plain.match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/,
  );
  if (frMonth) {
    const key = dateFromDayMonth(Number(frMonth[1]), FR_MONTHS[frMonth[2]!] ?? -1);
    if (key) return key;
  }

  const enMonth = plain.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/,
  );
  if (enMonth) {
    const key = dateFromDayMonth(Number(enMonth[2]), EN_MONTHS[enMonth[1]!] ?? -1);
    if (key) return key;
  }

  const prochain = plain.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+prochain\b/,
  );
  if (prochain) {
    const weekday = FR_WEEKDAYS[prochain[1]!] ?? EN_WEEKDAYS[prochain[1]!];
    if (weekday != null) return nextWeekday(weekday, true);
  }

  const weekday = plain.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (weekday) {
    const index = FR_WEEKDAYS[weekday[1]!] ?? EN_WEEKDAYS[weekday[1]!];
    if (index != null) return nextWeekday(index, false);
  }

  const parsed = parseManageDeadline(text, 99);
  if (parsed.dateKey !== defaultFutureDateKey(99) && hasDate(text)) return parsed.dateKey;
  return null;
}

function dayPartMeridiem(text: string): string | undefined {
  const plain = prepareCalendarText(text).toLowerCase();
  if (/\b(du soir|de l'apres-midi|de l apres-midi|cet apres-midi|afternoon|evening)\b/.test(plain)) {
    return "pm";
  }
  if (/\b(du matin|le matin|morning)\b/.test(plain)) return "am";
  return undefined;
}

function clockToMinutes(hour: number, minute: number, meridiem?: string): number | null {
  let h = hour;
  if (meridiem) {
    const marker = meridiem.toLowerCase();
    if (marker === "pm" && h < 12) h += 12;
    if (marker === "am" && h === 12) h = 0;
  }
  if (h < 0 || h > 23 || minute < 0 || minute > 59) return null;
  return h * 60 + minute;
}

function hourSpanMinutes(hour: string, minute?: string): number | null {
  const hours = Number(hour);
  const minutes = minute && /^\d+$/.test(minute) ? Number(minute) : 0;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  if (hours === 24 && minutes !== 0) return null;
  const total = hours * 60 + minutes;
  if (total <= 0 || total > 24 * 60) return null;
  return total;
}

function wordDurationMinutes(word: string): number | null {
  const hours: Record<string, number> = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4 };
  const value = hours[word.toLowerCase()];
  return value == null ? null : value * 60;
}

/** Durée totale dite par l'utilisateur. Une heure seule ne compte pas comme une durée. */
export function findCalendarDurationMinutes(text: string): number | null {
  const plain = prepareCalendarText(text);
  const prefixed = plain.match(
    /\b(?:pendant|duree(?:\s+de)?|durant|dure(?:r)?)\s+(\d{1,2})\s*h(?:\s*(\d{1,2}))?\b/i,
  );
  if (prefixed) return hourSpanMinutes(prefixed[1]!, prefixed[2]);
  const prefixedMin = plain.match(
    /\b(?:pendant|duree(?:\s+de)?|durant|dure(?:r)?)\s+(\d{1,3})\s*min(?:ute)?s?\b/i,
  );
  if (prefixedMin) {
    const minutes = Number(prefixedMin[1]);
    if (minutes > 0 && minutes <= 24 * 60) return minutes;
  }
  const prefixedWord = plain.match(
    /\b(?:pendant|duree(?:\s+de)?|durant|dure(?:r)?)\s+(une?|deux|trois|quatre)\s+heures?\b/i,
  );
  if (prefixedWord) return wordDurationMinutes(prefixedWord[1]!);
  if (/\bdemi[-\s]?heure\b/i.test(plain)) return 30;
  const minutes = plain.match(/\b(\d{1,3})\s*min(?:ute)?s?\b/i);
  if (minutes) {
    const value = Number(minutes[1]);
    if (value > 0 && value <= 24 * 60) return value;
  }
  const wordHours = plain.match(/\b(une|un|deux|trois|quatre)\s+heures?\b/i);
  if (wordHours && !isClockLeadIn(plain, wordHours.index ?? 0)) {
    return wordDurationMinutes(wordHours[1]!);
  }
  const numericHours = plain.match(/\b(\d{1,2})\s+heures?\b/i);
  if (numericHours && !isClockLeadIn(plain, numericHours.index ?? 0)) {
    return hourSpanMinutes(numericHours[1]!);
  }
  const startMatch = findCalendarStartMatch(plain);
  if (startMatch == null) return null;
  const startEnd = startMatch.index + startMatch.length;
  const clocks = [...plain.matchAll(/\b(\d{1,2})\s*h(?:\s*(\d{1,2}))?\b/gi)];
  const later = clocks.filter((clock) => (clock.index ?? 0) >= startEnd && !isClockLeadIn(plain, clock.index ?? 0));
  const candidate = later[later.length - 1];
  if (!candidate) return null;
  const hours = Number(candidate[1]);
  if (hours > 12 && !candidate[2]) return null;
  return hourSpanMinutes(candidate[1]!, candidate[2]);
}

function isClockLeadIn(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 12), index);
  return /(?:dans|a|à|vers|at|around)\s*$/i.test(before);
}

function findCalendarStartMatch(plain: string): { minutes: number; index: number; length: number } | null {
  const singles: RegExp[] = [
    /\b(?:à|a|vers|at|around)\s+(\d{1,2})\s*h(?:[ \t]*(\d{1,2}))?(?![ \t]*min)/gi,
    /\b(\d{1,2})\s*h(?:[ \t]*(\d{1,2}))?(?![ \t]*min)/gi,
    /\b(\d{1,2}):(\d{2})\b/g,
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi,
  ];
  for (const pattern of singles) {
    for (const match of plain.matchAll(pattern)) {
      if (match.index == null) continue;
      const before = plain.slice(Math.max(0, match.index - 18), match.index);
      if (/(?:pendant|duree|durant|dure(?:r)?)\s*$/i.test(before)) continue;
      const minute = match[2] && /^\d+$/.test(match[2]) ? Number(match[2]) : 0;
      const meridiem =
        match[3] && /am|pm/i.test(match[3])
          ? match[3]
          : match[2] && /am|pm/i.test(match[2])
            ? match[2]
            : undefined;
      const minuteValue = meridiem && match[2] && /am|pm/i.test(match[2]) ? 0 : minute;
      const start = clockToMinutes(Number(match[1]), minuteValue, meridiem ?? dayPartMeridiem(plain));
      if (start != null) return { minutes: start, index: match.index, length: match[0].length };
    }
  }
  return null;
}

function findCalendarStartMinutes(text: string): number | null {
  return findCalendarStartMatch(prepareCalendarText(text))?.minutes ?? null;
}

export function findCalendarTimes(text: string): { startMinutes: number; endMinutes: number } | null {
  const rangeFr = text.match(
    /\b(\d{1,2})\s*h\s*(\d{1,2})?\s*(?:à|a|–|-|to)\s*(\d{1,2})\s*h\s*(\d{1,2})?\b/i,
  );
  if (rangeFr) {
    const start = clockToMinutes(Number(rangeFr[1]), rangeFr[2] ? Number(rangeFr[2]) : 0);
    const end = clockToMinutes(Number(rangeFr[3]), rangeFr[4] ? Number(rangeFr[4]) : 0);
    if (start != null && end != null && end > start) return { startMinutes: start, endMinutes: end };
  }

  const rangeColon = text.match(/\b(\d{1,2}):(\d{2})\s*(?:à|a|–|-|to)\s*(\d{1,2}):(\d{2})\b/i);
  if (rangeColon) {
    const start = clockToMinutes(Number(rangeColon[1]), Number(rangeColon[2]));
    const end = clockToMinutes(Number(rangeColon[3]), Number(rangeColon[4]));
    if (start != null && end != null && end > start) return { startMinutes: start, endMinutes: end };
  }

  const rangeEn = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
  );
  if (rangeEn) {
    const start = clockToMinutes(Number(rangeEn[1]), Number(rangeEn[2] ?? 0), rangeEn[3] ?? rangeEn[6]);
    const end = clockToMinutes(Number(rangeEn[4]), Number(rangeEn[5] ?? 0), rangeEn[6]);
    if (start != null && end != null && end > start) return { startMinutes: start, endMinutes: end };
  }

  const until = prepareCalendarText(text).match(
    /\b(?:jusqu'?\s*a|until|till)\s+(\d{1,2})(?:\s*h\s*(\d{1,2})?|:(\d{2}))\b/i,
  );
  if (until) {
    const start = findCalendarStartMinutes(text);
    const end = clockToMinutes(Number(until[1]), Number(until[2] ?? until[3] ?? 0));
    if (start != null && end != null && end > start) return { startMinutes: start, endMinutes: end };
  }

  const start = findCalendarStartMinutes(text);
  const duration = findCalendarDurationMinutes(text);
  if (start == null || duration == null) return null;
  const end = Math.min(start + duration, 24 * 60 - 1);
  if (end <= start) return null;
  return { startMinutes: start, endMinutes: end };
}

function stripAll(pattern: RegExp, value: string): string {
  return value.replace(new RegExp(pattern.source, "gi"), " ");
}

function stripTitleLine(line: string): string {
  return stripAll(
    DATE_RE,
    stripAll(
      TIME_RE,
      stripAll(
        ADD_VERB_RE,
        stripAll(
          EVENT_WORD_RE,
          stripAll(
            CALENDAR_WORD_RE,
            prepareCalendarText(line)
              .replace(/\b\d{1,3}\s*min(?:ute)?s?\b/gi, " ")
              .replace(/\b(?:une|un|deux|trois|quatre|\d{1,2})\s+heures?\b/gi, " ")
              .replace(/\bdemi[-\s]?heure\b/gi, " "),
          ),
        ),
      ),
    ),
  )
    .replace(
      /\b(dans|sur|mon|ma|mes|the|my|un|une|le|la|les|pour|vers|chez|avec|from|to|at|on|in|of|de|du|des|au|aux|a|à|le|stp|svp|please|merci|je|j|ai|tu|il|elle|ils|elles|on|ce|sera|serai|serait|doit|dois|faut|veux|voudrais|aimerais|peux|peut|prochain|matin|soir|midi|apres|qui|vient|element|elements|chose|choses|quelque|quelques|que|jour|jours|pendant|durant|duree|dure|durer|minute|minutes|min|heure|heures|demi|totale|total|notre|nos|ton|ta|tes|votre|vos|ca|cela|cest|quoi|quand)\b/gi,
      " ",
    )
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(text: string): string | null {
  for (const line of text.split(/\n+/)) {
    const cleaned = stripTitleLine(line);
    if (cleaned.length < 2 || !/\p{L}/u.test(cleaned)) continue;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return null;
}

export function isCalendarAddRequest(text: string): boolean {
  const trimmed = prepareCalendarText(text).trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (/^(comment|how|pourquoi|why|c'est quoi|qu'est-ce)\b/i.test(trimmed) && !hasTime(trimmed)) {
    return false;
  }
  if (isNaturalLanguageManageRequest(trimmed) || /(?:^|\s)\/meeting\b/i.test(trimmed)) return false;
  if (
    /\b(réunion|reunion|meeting|visio)\b/i.test(trimmed) &&
    (/@[\w.-]+/.test(trimmed) || /\b(?:avec|with)\s+\S/.test(trimmed))
  ) {
    return false;
  }
  const mentionsCalendar = CALENDAR_WORD_RE.test(trimmed);
  const mentionsEvent = EVENT_WORD_RE.test(trimmed);
  const viewing = /\b(voir|consulte\w*|affiche\w*|montre\w*|ouvrir|regarde\w*|check)\b/i.test(trimmed);
  const wantsAdd =
    ADD_VERB_RE.test(trimmed) ||
    (!viewing && /\b(veux|voudrais|aimerais|souhaite\w*|besoin)\b/i.test(trimmed));
  if (mentionsCalendar && (wantsAdd || hasTime(trimmed) || hasDate(trimmed))) return true;
  if (mentionsEvent && wantsAdd) return true;
  return mentionsEvent && hasTime(trimmed) && hasDate(trimmed);
}

export function parseCalendarAdd(text: string): CalendarAddDraft | null {
  const dateKey = findCalendarDateKey(text);
  const times = findCalendarTimes(text);
  const title = cleanTitle(text);
  if (!dateKey || !times || !title) return null;
  return { title, dateKey, ...times };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]!.trim() : text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function llmCalendarAdd(
  text: string,
  workspaceId: string | undefined,
  signal?: AbortSignal,
): Promise<CalendarAddDraft | null> {
  if (!hasTime(text) || !hasDate(text)) return null;
  const prompt = [
    "Extract one calendar event from the user message.",
    `Today is ${toDateKey(new Date())}.`,
    "Reply with JSON only:",
    '{"title":"","dateKey":"YYYY-MM-DD","startTime":"HH:MM","endTime":"HH:MM"}',
    "Leave a field empty when the message does not say it. Do not invent a date, a start time, or a duration.",
    "",
    `User message: ${text}`,
  ].join("\n");
  const response = await api.chat(prompt, "auto", [], signal, undefined, workspaceId);
  const data = parseJsonObject(response.message);
  if (!data) return null;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const dateKey = typeof data.dateKey === "string" ? data.dateKey.trim() : "";
  const startTime = typeof data.startTime === "string" ? data.startTime.trim() : "";
  const endTime = typeof data.endTime === "string" ? data.endTime.trim() : "";
  if (!title || !isValidDateKey(dateKey) || !/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) {
    return null;
  }
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const startMinutes = clockToMinutes(startHour!, startMinute!);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const endMinutes = clockToMinutes(endHour!, endMinute!);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) return null;
  return { title: title.charAt(0).toUpperCase() + title.slice(1), dateKey, startMinutes, endMinutes };
}

export async function resolveCalendarAdd(
  text: string,
  options: { signal?: AbortSignal; workspaceId?: string; allowLlm: boolean },
): Promise<CalendarAddDraft | "ask" | null> {
  if (!isCalendarAddRequest(text)) return null;
  const local = parseCalendarAdd(text);
  if (local) return local;
  const detailsReady =
    cleanTitle(text) != null &&
    findCalendarDateKey(text) != null &&
    findCalendarStartMinutes(text) != null &&
    findCalendarDurationMinutes(text) != null;
  if (options.allowLlm && detailsReady) {
    try {
      const parsed = await llmCalendarAdd(text, options.workspaceId, options.signal);
      if (parsed) return parsed;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }
  return "ask";
}

export function formatCalendarAddPrompt(draft: CalendarAddDraft): string {
  return `Ajouter « ${draft.title} » le ${formatDayLabel(draft.dateKey)} · ${formatScheduleTime(draft.startMinutes)}–${formatScheduleTime(draft.endMinutes)} ?`;
}

function joinAsk(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

export function calendarAskMessage(text: string): string {
  const complete = findCalendarTimes(text) != null;
  const missing: string[] = [];
  if (!cleanTitle(text)) missing.push("quel rendez-vous");
  if (!findCalendarDateKey(text)) missing.push("quel jour");
  if (!complete && findCalendarStartMinutes(text) == null) missing.push("à quelle heure");
  if (!complete && findCalendarDurationMinutes(text) == null) missing.push("la durée");
  if (missing.length === 0) return "Précise le rendez-vous à ajouter au calendrier.";
  if (missing.length === 4) {
    return "C'est pour quel rendez-vous, quel jour, à quelle heure, et pour quelle durée ?";
  }
  if (missing.length === 1 && missing[0] === "la durée") return "Ça dure combien de temps ?";
  return `Il me faut encore ${joinAsk(missing)}.`;
}

export interface CalendarChatTurn {
  role: string;
  text: string;
  source?: string;
  calendarAdd?: unknown;
  mailSend?: unknown;
}

/** Le message suivant complète la demande d'horaire. Le reste du chat, y compris une chanson, n'entre pas dans la lecture. */
export function calendarFollowUpText(prior: CalendarChatTurn[], current: string): string {
  if (isPlaySongRequest(current) || isMailSendRequest(current) || /\bvolume\b/i.test(current)) return current;
  let anchor = -1;
  for (let index = prior.length - 1; index >= 0; index -= 1) {
    const message = prior[index];
    if (message?.calendarAdd || message?.mailSend) break;
    if (message?.role === "assistant" && message.source === "play-skill") break;
    if (message?.role === "user" && isMailSendRequest(message.text)) break;
    if (message?.role === "user" && isCalendarAddRequest(message.text)) {
      anchor = index;
      break;
    }
  }
  if (anchor < 0) return current;
  if (parseCalendarAdd(current) && isCalendarAddRequest(current)) return current;
  const parts = [prior[anchor]!.text];
  for (let index = anchor + 1; index < prior.length; index += 1) {
    const message = prior[index];
    if (message?.role === "user" && message.text.trim()) parts.push(message.text.trim());
  }
  parts.push(current.trim());
  return parts.join("\n");
}

export function isPlaySongRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 400) return false;
  if (isCalendarAddRequest(trimmed)) return false;
  if (/\b(joue|play)\b.{0,24}\b(foot|football|soccer|jeu|game|rôle|role|theatre|théâtre)\b/i.test(trimmed)) {
    return false;
  }
  if (/\b(au|aux)\s+(foot|football|soccer)\b/i.test(trimmed)) return false;
  return PLAY_INTENT_RE.test(trimmed) || PLAY_LEADING_RE.test(trimmed);
}

const PLAY_STRIPS: RegExp[] = [
  /^(?:peux-tu|pourrais-tu|tu peux|est-ce que tu peux|can you|could you)\s+/i,
  /^(?:j'aimerais|je voudrais|je veux|i want to|i wanna|i'd like to|i want)\s+/i,
  /^(?:faire jouer|fais jouer|fait jouer|me faire jouer)\s+/i,
  /^(?:joue(?:r)?(?:-moi)?|play(?: me)?|écout\w*|ecout\w*|listen to|mets(?:\s*|-)?moi|met(?:s)?(?:\s*|-)?moi|mets|met|lance(?:-moi)?|balance(?:-moi)?|put on|ouvre|open)\s+/i,
  /^(?:la\s+chanson|le\s+titre|une\s+chanson|the\s+song|the\s+track|chanson|song|track)\s+/i,
];

export function parsePlayQuery(text: string): string | null {
  let query = text.trim();
  query = query.replace(/\b(stp|svp|s'il te pla[iî]t|please|merci)\b/gi, " ");
  query = query.replace(/\b(sur|dans|via)\s+spotify\b/gi, " ");
  query = query.replace(/\bspotify\b/gi, " ");
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of PLAY_STRIPS) {
      const next = query.replace(pattern, "");
      if (next !== query) {
        query = next.trim();
        changed = true;
      }
    }
  }
  query = query.replace(/^(?:de|d'|du|des|by)\s+/i, "").replace(/[?.!]+$/g, "").trim();
  if (query.length < 2) return null;
  if (/^(spotify|musique|music|chanson|song|titre|track|ouvre|open|joue|play|écoute|ecoute|mets|met|lance)$/i.test(query)) {
    return null;
  }
  return query;
}

async function llmPlayQuery(
  text: string,
  workspaceId: string | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const prompt = [
    "The user wants to play a song. Extract the Spotify search query (title and artist).",
    'Reply with JSON only: {"query":""}',
    "Leave query empty if no specific song is named.",
    "",
    `User message: ${text}`,
  ].join("\n");
  const response = await api.chat(prompt, "auto", [], signal, undefined, workspaceId);
  const data = parseJsonObject(response.message);
  const query = typeof data?.query === "string" ? data.query.trim() : "";
  if (query.length < 2) return null;
  return query;
}

export async function resolvePlayQuery(
  text: string,
  options: { signal?: AbortSignal; workspaceId?: string; allowLlm: boolean },
): Promise<string | "ask" | null> {
  if (!isPlaySongRequest(text)) return null;
  const local = parsePlayQuery(text);
  if (local) return local;
  if (options.allowLlm) {
    try {
      const query = await llmPlayQuery(text, options.workspaceId, options.signal);
      if (query) return query;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }
  return "ask";
}

export const PLAY_QUERY_MISSING =
  "Dis le titre ou l'artiste à jouer. Par exemple : « joue No Lie de Sean Paul ».";
