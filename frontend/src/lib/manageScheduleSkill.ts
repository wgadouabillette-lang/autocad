import { api } from "./api";
import { isManageSchedulePrompt } from "./chatSkills";
import {
  formatTaskDurationLabel,
  isNaturalLanguageManageRequest,
  normalizeManagePromptDraft,
  parseDurationMinutes,
  resolveTaskDurationMinutes,
  type ManageSchedulePromptDraft,
} from "./manageSchedulePrompt";
import type { CalendarEvent } from "../store/useCalendarStore";
import { useCalendarStore } from "../store/useCalendarStore";
import { createUserCalendarEvents, fetchUserCalendarEvents } from "./calendarEventsApi";
import {
  fetchGoogleCalendarEventsForRange,
  fetchGoogleCalendarStatus,
} from "./calendarSync";
import {
  fetchOutlookCalendarEventsForRange,
  fetchOutlookCalendarStatus,
} from "./outlookCalendarSync";
import { notifyCalendarEventsChanged } from "../hooks/usePersistedCalendarEvents";
import { useStore } from "../store/useStore";
import {
  DEFAULT_CALENDAR_WORK_END_MINUTES,
  DEFAULT_CALENDAR_WORK_START_MINUTES,
  formatCalendarWorkTime,
  resolveCalendarWorkingHours,
  type CalendarWorkingHours,
} from "./userPreferences";
import {
  coerceDateKey,
  formatDayLabel,
  formatScheduleTime,
  minutesFromMidnightLocal,
  normalizeDateKey,
  parseDateKey,
  parseManageDeadline,
  toDateKey,
  type DayScheduleEvent,
} from "./daySchedule";

export const DEFAULT_WORK_START_MINUTES = DEFAULT_CALENDAR_WORK_START_MINUTES;
export const DEFAULT_WORK_END_MINUTES = DEFAULT_CALENDAR_WORK_END_MINUTES;
export const SCHEDULE_BUFFER_MINUTES = 15;

export interface ManageScheduleEventDraft {
  title: string;
  detail?: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

export interface ManageScheduleResult {
  applied: boolean;
  summary: string;
  events: ManageScheduleEventDraft[];
  firstDateKey: string | null;
}

/** Heures de travail configurées dans Paramètres → General. */
export function getCalendarWorkingHours(): CalendarWorkingHours {
  const state = useStore.getState();
  return resolveCalendarWorkingHours(
    state.calendarWorkStartMinutes,
    state.calendarWorkEndMinutes,
  );
}

interface ParsedManageTask {
  title: string;
  durationMinutes: number;
}

interface ParsedManageBlock {
  deadline: string;
  deadlineMinutes?: number;
  workStartMinutes: number;
  workEndMinutes: number;
  defaultDurationMinutes: number;
  tasks: ParsedManageTask[];
}

function parseJsonFromLlm(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON introuvable");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseTimeToMinutes(value: string, fallback: number): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return hours * 60 + minutes;
}

function defaultManageDeadlineFromParsed(): string {
  return coerceDateKey("");
}

/** Normalise une deadline /manage → clé valide + heure optionnelle, repli J+7. */
function normalizeDeadline(raw: string): { dateKey: string; deadlineMinutes?: number } {
  return parseManageDeadline(raw.trim());
}

function formatParsedBlockForAi(parsed: ParsedManageBlock): string {
  const deadlineLine =
    parsed.deadlineMinutes != null
      ? `Deadline: ${parsed.deadline} at ${formatScheduleTime(parsed.deadlineMinutes)}`
      : `Deadline: ${parsed.deadline}`;
  const hoursLabel = `${formatCalendarWorkTime(parsed.workStartMinutes)}-${formatCalendarWorkTime(parsed.workEndMinutes)}`;
  return [
    "Tasks:",
    ...parsed.tasks.map(
      (task) => `- ${task.title} (${formatTaskDurationLabel(task.durationMinutes)})`,
    ),
    deadlineLine,
    `Working hours: ${hoursLabel}`,
    `Default task duration: ${parsed.defaultDurationMinutes} minutes`,
  ].join("\n");
}

function splitNaturalManageTasks(raw: string): string[] {
  return raw
    .replace(/,?\s*taking into account my current schedule\.?$/i, "")
    .replace(/,?\s*en tenant compte de mon (?:horaire|planning|calendrier)(?: actuel)?\.?$/i, "")
    .split(/,\s*|\s+(?:and|et)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function pushParsedNaturalTasks(
  tasksRaw: string,
  defaultDurationMinutes: number,
  tasks: ParsedManageTask[],
): void {
  for (const part of splitNaturalManageTasks(tasksRaw)) {
    const parenMatch = part.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (parenMatch) {
      const title = parenMatch[1]!.trim();
      const durationMinutes =
        parseDurationMinutes(parenMatch[2]!) ?? defaultDurationMinutes;
      if (title) {
        tasks.push({
          title,
          durationMinutes: resolveTaskDurationMinutes(durationMinutes),
        });
      }
      continue;
    }
    tasks.push({ title: part, durationMinutes: defaultDurationMinutes });
  }
}

function tryParseNaturalManage(text: string): { tasksRaw: string; deadlineRaw: string } | null {
  const patterns = [
    /need to do\s+(.+?)\s+before\s+(?:the\s+)?([^,\n.]+)/i,
    /(?:want|need) to\s+(?:do|finish|complete)\s+(.+?)\s+(?:before|by)\s+(?:the\s+)?([^,\n.]+)/i,
    /(?:je\s+(?:veux|dois|voudrais)\s+(?:faire|terminer|finir|accomplir)|j'ai besoin de (?:faire|terminer))\s+(.+?)\s+avant\s+(?:le\s+)?([^,\n.]+)/i,
    /\bfaire\s+(.+?)\s+avant\s+(?:le\s+)?([^,\n.]+)/i,
    /(?:planifier|organiser|schedule)\s+(.+?)\s+(?:avant|before|by|d'ici)\s+(?:le\s+|the\s+)?([^,\n.]+)/i,
    /(?:t[âa]ches?\s*(?:à faire|:)?\s*)(.+?)\s+(?:avant|before|d'ici|by)\s+(?:le\s+|the\s+)?([^,\n.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim() && match[2]?.trim()) {
      return { tasksRaw: match[1].trim(), deadlineRaw: match[2].trim() };
    }
  }
  return null;
}

function parseManageBlock(text: string): ParsedManageBlock {
  const configuredHours = getCalendarWorkingHours();
  const lines = text.split("\n");
  let deadlineRaw = "";
  let workStartMinutes = configuredHours.startMinutes;
  let workEndMinutes = configuredHours.endMinutes;
  let defaultDurationMinutes = 30;
  const tasks: ParsedManageTask[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const deadlineMatch = trimmed.match(/^deadline:\s*(.+)$/i);
    if (deadlineMatch) {
      deadlineRaw = deadlineMatch[1].trim();
      continue;
    }

    const hoursMatch = trimmed.match(/^working hours:\s*(.+)$/i);
    if (hoursMatch) {
      const [startRaw, endRaw] = hoursMatch[1].split("-");
      workStartMinutes = parseTimeToMinutes(startRaw ?? "", workStartMinutes);
      workEndMinutes = parseTimeToMinutes(endRaw ?? "", workEndMinutes);
      continue;
    }

    const durationMatch = trimmed.match(/^default task duration:\s*(.+)$/i);
    if (durationMatch) {
      const minutesMatch = durationMatch[1].match(/(\d+)/);
      if (minutesMatch) defaultDurationMinutes = Number(minutesMatch[1]);
      continue;
    }

    const taskMatch = trimmed.match(/^[-*•]\s*(.+)$/);
    if (taskMatch) {
      const rawTitle = taskMatch[1].trim();
      if (!rawTitle || /^task title \d+$/i.test(rawTitle) || rawTitle === "YYYY-MM-DD") {
        continue;
      }
      const parenMatch = rawTitle.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (parenMatch) {
        const title = parenMatch[1]!.trim();
        const durationMinutes =
          parseDurationMinutes(parenMatch[2]!) ?? defaultDurationMinutes;
        if (title) tasks.push({ title, durationMinutes: resolveTaskDurationMinutes(durationMinutes) });
        continue;
      }
      tasks.push({ title: rawTitle, durationMinutes: defaultDurationMinutes });
    }
  }

  if (tasks.length === 0) {
    const natural = tryParseNaturalManage(text);
    if (natural) {
      pushParsedNaturalTasks(natural.tasksRaw, defaultDurationMinutes, tasks);
      if (!deadlineRaw) deadlineRaw = natural.deadlineRaw;
    }
  }

  const { dateKey: deadline, deadlineMinutes } = normalizeDeadline(deadlineRaw || "");

  return {
    deadline,
    deadlineMinutes,
    workStartMinutes,
    workEndMinutes,
    defaultDurationMinutes,
    tasks,
  };
}

function enumerateDateKeys(fromKey: string, toKey: string): string[] {
  const from = normalizeDateKey(fromKey, toDateKey(new Date()));
  const to = normalizeDateKey(toKey, from);
  const out: string[] = [];
  const cursor = parseDateKey(from);
  const end = parseDateKey(to);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return out;
  while (cursor <= end) {
    out.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function gatherCalendarContext(dateKeys: string[]): Array<{ dateKey: string; events: DayScheduleEvent[] }> {
  const calendar = useCalendarStore.getState();
  return dateKeys.map((dateKey) => ({
    dateKey,
    events: calendar.eventsForDate(dateKey),
  }));
}

/**
 * Pré-charge les events Google + Outlook pour toute la fenêtre de planification afin
 * que `eventsForDate` (et donc le contexte donné au LLM + le fallback local) couvre
 * tout l'horaire visible dans l'onglet Calendrier, pas uniquement la date sélectionnée.
 * External calendars are read-only context for scheduling; manage blocks are written to the in-app store only.
 */
async function preloadCalendarConflictsForRange(dateKeys: string[]): Promise<void> {
  if (dateKeys.length === 0) return;

  const store = useCalendarStore.getState();
  const fromKey = dateKeys[0]!;
  const toKey = dateKeys[dateKeys.length - 1]!;

  try {
    const googleStatus = await fetchGoogleCalendarStatus();
    if (googleStatus.configured && googleStatus.connected) {
      const events = await fetchGoogleCalendarEventsForRange(fromKey, toKey);
      const byDate = new Map<string, typeof events>();
      for (const event of events) {
        const bucket = byDate.get(event.dateKey);
        if (bucket) bucket.push(event);
        else byDate.set(event.dateKey, [event]);
      }
      for (const dateKey of dateKeys) {
        store.setGoogleEvents(byDate.get(dateKey) ?? [], dateKey);
      }
    }
  } catch {
    // Connecteur non lié ou erreur transitoire — on continue avec les events déjà connus.
  }

  try {
    const outlookStatus = await fetchOutlookCalendarStatus();
    if (outlookStatus.configured && outlookStatus.connected) {
      const events = await fetchOutlookCalendarEventsForRange(fromKey, toKey);
      const byDate = new Map<string, typeof events>();
      for (const event of events) {
        const bucket = byDate.get(event.dateKey);
        if (bucket) bucket.push(event);
        else byDate.set(event.dateKey, [event]);
      }
      for (const dateKey of dateKeys) {
        store.setOutlookEvents(byDate.get(dateKey) ?? [], dateKey);
      }
    }
  } catch {
    // Connecteur non lié ou erreur transitoire.
  }
}

function formatCalendarContext(
  days: Array<{ dateKey: string; events: DayScheduleEvent[] }>,
): string {
  if (days.every((day) => day.events.length === 0)) return "No existing events.";
  return days
    .filter((day) => day.events.length > 0)
    .map((day) => {
      const slots = day.events
        .map(
          (event) =>
            `${formatScheduleTime(event.startMinutes)}-${formatScheduleTime(event.endMinutes)} ${event.title}`,
        )
        .join("; ");
      return `${day.dateKey}: ${slots}`;
    })
    .join("\n");
}

function buildManageScheduleAiPrompt(
  userBlock: string,
  calendarContext: Array<{ dateKey: string; events: DayScheduleEvent[] }>,
  parsed: ParsedManageBlock,
): string {
  const now = new Date();
  const today = toDateKey(now);
  const currentTime = formatScheduleTime(minutesFromMidnightLocal(now));
  const deadlineKey = effectiveDeadlineKey(parsed.deadline);
  const deadlineTimeLine =
    parsed.deadlineMinutes != null
      ? ` Tasks must finish by ${formatScheduleTime(parsed.deadlineMinutes)} on ${deadlineKey}.`
      : "";
  const startLabel = formatCalendarWorkTime(parsed.workStartMinutes);
  const endLabel = formatCalendarWorkTime(parsed.workEndMinutes);
  return [
    "You are a scheduling assistant inside a calendar app.",
    "Parse the user's /manage block and schedule every listed task in their calendar before the deadline.",
    "Respond ONLY with valid JSON (no markdown, no prose) shaped exactly as:",
    `{"summary":"short explanation in French","events":[{"title":"...","detail":"optional","dateKey":"YYYY-MM-DD","startMinutes":${parsed.workStartMinutes},"endMinutes":${parsed.workStartMinutes + 30}}]}`,
    "",
    "Strict rules:",
    `- startMinutes/endMinutes are minutes from midnight (${startLabel} = ${parsed.workStartMinutes}, 14:30 = 870).`,
    `- Working hours are ${startLabel}-${endLabel} unless the user overrides them in the /manage block.`,
    `- Today is ${today} at ${currentTime} local time. Never schedule before the current time on today.`,
    `- The deadline is ${deadlineKey}.${deadlineTimeLine}`,
    "- Schedule ONLY in the future — never before today, and never before the current time on today.",
    "- The 'Existing calendar events' block below lists busy time slots. Your scheduled tasks MUST NOT overlap any of them.",
    "- Spread tasks across the days from today through the deadline. Prefer earlier days when possible.",
    "- Each task duration is listed beside the task name (e.g. \"45 min\"). Respect those durations when setting startMinutes/endMinutes.",
    "- Each task must last at least 15 minutes (default 30 minutes when unspecified).",
    "- Insert a 10 minute buffer between two consecutive tasks on the same day.",
    "- Include EVERY task from the user list. Never skip a task — always return exactly one event per task.",
    "- If a day is fully busy, schedule on the next available day (still before or on the deadline when possible).",
    "- Generate a clear French title for each event block (can match or refine the task name).",
    "- The summary field must be in French.",
    "",
    "Existing calendar events (busy slots, do not overlap):",
    formatCalendarContext(calendarContext),
    "",
    "User /manage block:",
    userBlock.trim(),
  ].join("\n");
}

function normalizeEventsFromLlm(
  data: Record<string, unknown>,
  parsed: ParsedManageBlock,
): ManageScheduleEventDraft[] {
  const rows = Array.isArray(data.events) ? data.events : [];
  const events: ManageScheduleEventDraft[] = [];
  for (const item of rows) {
    const row = item as Record<string, unknown>;
    const dateKey = normalizeDateKey(asString(row.dateKey));
    const startMinutes = asNumber(row.startMinutes, parsed.workStartMinutes);
    const endMinutes = asNumber(row.endMinutes, startMinutes + 30);
    const title = asString(row.title);
    if (!dateKey || !title) continue;
    events.push({
      title,
      detail: asString(row.detail) || undefined,
      dateKey,
      startMinutes,
      endMinutes: endMinutes > startMinutes ? endMinutes : startMinutes + 30,
    });
  }
  return events;
}

function filterValidScheduleEvents(
  events: ManageScheduleEventDraft[],
  parsed: ParsedManageBlock,
): ManageScheduleEventDraft[] {
  const today = toDateKey(new Date());
  const deadlineKey = effectiveDeadlineKey(parsed.deadline);

  return events.filter((event) => {
    const minStart = minStartMinutesForDate(
      event.dateKey,
      today,
      parsed.workStartMinutes,
      parsed.workEndMinutes,
      event.endMinutes - event.startMinutes,
    );
    if (minStart == null) return false;
    if (event.dateKey < today) return false;
    if (event.dateKey === today && event.startMinutes < minStart) return false;
    if (event.startMinutes < parsed.workStartMinutes) return false;
    if (event.endMinutes > parsed.workEndMinutes) return false;
    if (event.dateKey > deadlineKey) return false;
    if (
      event.dateKey === deadlineKey &&
      parsed.deadlineMinutes != null &&
      event.endMinutes > parsed.deadlineMinutes
    ) {
      return false;
    }
    return true;
  });
}

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

const MAX_SCHEDULE_EXTENSION_DAYS = 30;
const EXTENSION_STEP_DAYS = 7;

function addDaysToDateKey(dateKey: string, days: number): string {
  const safeKey = normalizeDateKey(dateKey);
  const cursor = parseDateKey(safeKey);
  cursor.setDate(cursor.getDate() + days);
  return toDateKey(cursor);
}

function effectiveDeadlineKey(deadline: string): string {
  const normalized = normalizeDeadline(deadline).dateKey;
  const today = toDateKey(new Date());
  const todayDate = parseDateKey(today);
  const deadlineDate = parseDateKey(normalized);
  if (!Number.isNaN(deadlineDate.getTime()) && deadlineDate < todayDate) {
    return addDaysToDateKey(today, 7);
  }
  return normalized;
}

function planningWindowEndKey(deadline: string): string {
  return addDaysToDateKey(effectiveDeadlineKey(deadline), MAX_SCHEDULE_EXTENSION_DAYS);
}

type BusySlot = { dateKey: string; startMinutes: number; endMinutes: number };

function minStartMinutesForDate(
  dateKey: string,
  today: string,
  workStartMinutes: number,
  workEndMinutes: number,
  durationMinutes: number,
): number | null {
  if (dateKey !== today) return workStartMinutes;

  const nowMinutes = minutesFromMidnightLocal();
  const bufferedStart = Math.max(workStartMinutes, nowMinutes + SCHEDULE_BUFFER_MINUTES);
  if (bufferedStart + durationMinutes <= workEndMinutes) return bufferedStart;

  const immediateStart = Math.max(workStartMinutes, nowMinutes);
  if (immediateStart + durationMinutes <= workEndMinutes) return immediateStart;

  return null;
}

function busySlotsForDate(
  dateKey: string,
  scheduled: ManageScheduleEventDraft[],
): BusySlot[] {
  const calendar = useCalendarStore.getState();
  const fromCalendar = calendar.eventsForDate(dateKey).map((event) => ({
    dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
  }));
  const fromScheduled = scheduled
    .filter((event) => event.dateKey === dateKey)
    .map((event) => ({
      dateKey: event.dateKey,
      startMinutes: event.startMinutes,
      endMinutes: event.endMinutes,
    }));
  return [...fromCalendar, ...fromScheduled];
}

function findFreeSlotOnDay(
  dateKey: string,
  durationMinutes: number,
  workStartMinutes: number,
  workEndMinutes: number,
  busy: BusySlot[],
  minStartMinutes?: number,
): { startMinutes: number; endMinutes: number } | null {
  let cursor = Math.max(workStartMinutes, minStartMinutes ?? workStartMinutes);
  while (cursor + durationMinutes <= workEndMinutes) {
    const endMinutes = cursor + durationMinutes;
    const conflict = busy.some((slot) =>
      overlaps(cursor, endMinutes, slot.startMinutes, slot.endMinutes),
    );
    if (!conflict) return { startMinutes: cursor, endMinutes };
    cursor += 15;
  }
  return null;
}

/**
 * Place chaque tâche dans un créneau futur libre (heures configurées dans Paramètres → General).
 * Étend la fenêtre au-delà de la deadline si nécessaire (max ~30 jours).
 * Ne retourne jamais moins d'events que de tâches — au pire force un créneau.
 */
function scheduleTasksLocally(
  parsed: ParsedManageBlock,
  seedEvents: ManageScheduleEventDraft[] = [],
): ManageScheduleEventDraft[] {
  if (parsed.tasks.length === 0) return seedEvents;

  const today = toDateKey(new Date());
  const deadlineKey = effectiveDeadlineKey(parsed.deadline);
  const scheduled = [...seedEvents];
  const tasksToPlace =
    seedEvents.length >= parsed.tasks.length
      ? []
      : parsed.tasks.slice(seedEvents.length);

  let searchEndKey = deadlineKey;
  const maxEndKey = planningWindowEndKey(parsed.deadline);

  for (const task of tasksToPlace) {
    const durationMinutes = resolveTaskDurationMinutes(task.durationMinutes);
    let placed = false;

    while (!placed && parseDateKey(searchEndKey) <= parseDateKey(maxEndKey)) {
      for (const dateKey of enumerateDateKeys(today, searchEndKey)) {
        const isDeadlineDay = dateKey === deadlineKey;

        let maxEnd = parsed.workEndMinutes;
        if (isDeadlineDay && parsed.deadlineMinutes != null) {
          maxEnd = Math.min(maxEnd, parsed.deadlineMinutes);
        }

        const minStart = minStartMinutesForDate(
          dateKey,
          today,
          parsed.workStartMinutes,
          maxEnd,
          durationMinutes,
        );
        if (minStart == null) continue;

        const slot = findFreeSlotOnDay(
          dateKey,
          durationMinutes,
          parsed.workStartMinutes,
          maxEnd,
          busySlotsForDate(dateKey, scheduled),
          minStart,
        );
        if (!slot) continue;
        scheduled.push({
          title: task.title,
          dateKey,
          startMinutes: slot.startMinutes,
          endMinutes: slot.endMinutes,
          detail: "Planifié par /manage",
        });
        placed = true;
        break;
      }
      if (placed) break;
      searchEndKey = addDaysToDateKey(searchEndKey, EXTENSION_STEP_DAYS);
    }

    if (!placed) {
      const fallbackDateKey =
        parseDateKey(searchEndKey) <= parseDateKey(maxEndKey) ? searchEndKey : maxEndKey;
      const fallbackStart =
        minStartMinutesForDate(
          fallbackDateKey,
          today,
          parsed.workStartMinutes,
          parsed.workEndMinutes,
          durationMinutes,
        ) ?? parsed.workStartMinutes;
      scheduled.push({
        title: task.title,
        dateKey: fallbackDateKey,
        startMinutes: fallbackStart,
        endMinutes: fallbackStart + durationMinutes,
        detail: "Planifié par /manage",
      });
    }
  }

  return scheduled;
}

export function buildManageScheduleIntro(deadline: string): string {
  const label = formatDayLabel(effectiveDeadlineKey(deadline));
  return `Voici comment j'organise vos tâches avant le ${label}. Cliquez sur **Appliquer au calendrier** pour les ajouter.`;
}

function localFallbackSchedule(userBlock: string): ManageScheduleResult {
  const parsed = parseManageBlock(userBlock);

  if (parsed.tasks.length === 0) {
    return {
      applied: false,
      summary: "Aucune tâche détectée dans la commande /manage.",
      events: [],
      firstDateKey: null,
    };
  }

  const scheduled = scheduleTasksLocally(parsed);

  return {
    applied: false,
    summary: formatManageScheduleSummary(
      `${buildManageScheduleIntro(parsed.deadline)} (mode local)`,
      scheduled,
    ),
    events: scheduled,
    firstDateKey: scheduled[0]?.dateKey ?? null,
  };
}

export function formatManageScheduleSummary(
  intro: string,
  events: ManageScheduleEventDraft[],
): string {
  const lines = events.map(
    (event) =>
      `- ${formatDayLabel(event.dateKey)} · ${formatScheduleTime(event.startMinutes)}–${formatScheduleTime(event.endMinutes)} · ${event.title}`,
  );
  return `${intro}\n\n${lines.join("\n")}`;
}

/**
 * Persiste les blocs /manage dans Firestore et synchronise Google / Outlook.
 */
export async function applyManageScheduleEvents(
  events: ManageScheduleEventDraft[],
): Promise<CalendarEvent[]> {
  if (events.length === 0) return [];
  const syncPayload = events.map((event) => ({
    title: event.title,
    detail: event.detail,
    dateKey: event.dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
  }));

  const saved = await createUserCalendarEvents(syncPayload, "manage-skill");
  useCalendarStore.getState().setUserEvents(await fetchUserCalendarEvents());
  notifyCalendarEventsChanged();
  window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
  return saved;
}

export async function runManageScheduleSkill(
  userBlock: string,
  signal?: AbortSignal,
  draft?: ManageSchedulePromptDraft,
): Promise<ManageScheduleResult> {
  if (
    !isManageSchedulePrompt(userBlock) &&
    !draft &&
    !isNaturalLanguageManageRequest(userBlock)
  ) {
    return { applied: false, summary: "", events: [], firstDateKey: null };
  }

  const parsed = draft
    ? (() => {
        const normalized = normalizeManagePromptDraft(draft);
        const { dateKey, deadlineMinutes } = normalizeDeadline(normalized.deadline);
        const hours = getCalendarWorkingHours();
        return {
          deadline: dateKey,
          deadlineMinutes,
          workStartMinutes: hours.startMinutes,
          workEndMinutes: hours.endMinutes,
          defaultDurationMinutes: 30,
          tasks: normalized.tasks
            .map((task) => ({
              title: task.title.trim(),
              durationMinutes: resolveTaskDurationMinutes(task.durationMinutes),
            }))
            .filter((task) => task.title.length > 0),
        };
      })()
    : parseManageBlock(userBlock);
  const today = toDateKey(new Date());
  const preloadEndKey = planningWindowEndKey(parsed.deadline);
  const dateKeys = enumerateDateKeys(today, preloadEndKey);
  // Aspire les events Google + Outlook pour toute la fenêtre, pas seulement la date sélectionnée
  // dans la tab Calendrier — sinon le LLM raisonne sur un horaire incomplet.
  if (dateKeys.length > 0) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await preloadCalendarConflictsForRange(dateKeys);
  }
  const calendarContext = gatherCalendarContext(dateKeys);
  const blockForAi =
    draft || isNaturalLanguageManageRequest(userBlock)
      ? formatParsedBlockForAi(parsed)
      : userBlock;
  const prompt = buildManageScheduleAiPrompt(
    blockForAi,
    calendarContext,
    parsed,
  );

  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await api.chat(prompt, "auto", [], signal);
    const data = parseJsonFromLlm(response.message);
    let events = filterValidScheduleEvents(normalizeEventsFromLlm(data, parsed), parsed);

    if (events.length < parsed.tasks.length) {
      events = scheduleTasksLocally(parsed, events);
    }
    if (events.length === 0 && parsed.tasks.length > 0) {
      throw new Error("Aucun événement");
    }

    // L'utilisateur confirme encore via le bouton si l'application auto a échoué.
    const intro = asString(data.summary, buildManageScheduleIntro(parsed.deadline));

    return {
      applied: false,
      summary: formatManageScheduleSummary(intro, events),
      events,
      firstDateKey: events[0]?.dateKey ?? null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (typeof console !== "undefined") {
      console.warn("[/manage] AI scheduling failed, falling back to local heuristics", error);
    }
    try {
      const fallback = localFallbackSchedule(blockForAi);
      return {
        ...fallback,
        // Même en fallback local, on attend la confirmation utilisateur.
        applied: false,
      };
    } catch (fallbackError) {
      if (typeof console !== "undefined") {
        console.warn("[/manage] local fallback failed, using minimal schedule", fallbackError);
      }
      const { dateKey, deadlineMinutes } = normalizeDeadline(parsed.deadline);
      const safeParsed: ParsedManageBlock = {
        ...parsed,
        deadline: dateKey,
        deadlineMinutes,
      };
      const scheduled =
        safeParsed.tasks.length > 0 ? scheduleTasksLocally(safeParsed) : [];
      return {
        applied: false,
        summary:
          scheduled.length > 0
            ? formatManageScheduleSummary("Planification locale (AI indisponible).", scheduled)
            : "Impossible de planifier automatiquement. Vérifiez la deadline et les créneaux disponibles.",
        events: scheduled,
        firstDateKey: scheduled[0]?.dateKey ?? null,
      };
    }
  }
}
