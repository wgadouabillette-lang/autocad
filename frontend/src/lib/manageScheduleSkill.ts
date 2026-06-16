import { api } from "./api";
import { isManageSchedulePrompt } from "./chatSkills";
import type { ManageSchedulePromptDraft } from "./manageSchedulePrompt";
import type { CalendarEvent } from "../store/useCalendarStore";
import { useCalendarStore } from "../store/useCalendarStore";
import { syncEventsToGoogleCalendar } from "./calendarSync";
import { useNotificationsStore } from "../store/useNotificationsStore";
import {
  formatDayLabel,
  formatScheduleTime,
  parseDateKey,
  toDateKey,
  type DayScheduleEvent,
} from "./daySchedule";

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

interface ParsedManageBlock {
  deadline: string;
  workStartMinutes: number;
  workEndMinutes: number;
  defaultDurationMinutes: number;
  tasks: string[];
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
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  return toDateKey(fallback);
}

function formatParsedBlockForAi(parsed: ParsedManageBlock): string {
  return [
    "Tasks:",
    ...parsed.tasks.map((task) => `- ${task}`),
    `Deadline: ${parsed.deadline}`,
    "Working hours: 09:00-18:00",
    "Default task duration: 30 minutes",
  ].join("\n");
}

function parseManageBlock(text: string): ParsedManageBlock {
  const lines = text.split("\n");
  let deadline = "";
  let workStartMinutes = 9 * 60;
  let workEndMinutes = 18 * 60;
  let defaultDurationMinutes = 30;
  const tasks: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const deadlineMatch = trimmed.match(/^deadline:\s*(.+)$/i);
    if (deadlineMatch) {
      deadline = deadlineMatch[1].trim();
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
      const title = taskMatch[1].trim();
      if (title && !/^task title \d+$/i.test(title) && title !== "YYYY-MM-DD") {
        tasks.push(title);
      }
    }
  }

  if (tasks.length === 0) {
    const natural =
      text.match(/need to do\s+(.+?)\s+before\s+([^,\n.]+)/i) ??
      text.match(/faire\s+(.+?)\s+avant\s+le\s+([^,\n.]+)/i);
    if (natural) {
      const parsedTasks = natural[1]!
        .split(/,\s*|\s+(?:and|et)\s+/i)
        .map((part) => part.trim())
        .filter(Boolean);
      if (parsedTasks.length > 0) tasks.push(...parsedTasks);
      if (!deadline) deadline = natural[2]?.trim() ?? "";
    }
  }

  if (!deadline || deadline === "YYYY-MM-DD") {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 7);
    deadline = toDateKey(fallback);
  }

  return {
    deadline,
    workStartMinutes,
    workEndMinutes,
    defaultDurationMinutes,
    tasks,
  };
}

function enumerateDateKeys(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const cursor = parseDateKey(fromKey);
  const end = parseDateKey(toKey);
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
): string {
  const today = toDateKey(new Date());
  return [
    "You are a scheduling assistant.",
    "Parse the user's /manage block and schedule every listed task on the in-app calendar before the deadline.",
    "Respond ONLY with valid JSON (no markdown) shaped as:",
    '{"summary":"short explanation in French","events":[{"title":"...","detail":"optional","dateKey":"YYYY-MM-DD","startMinutes":540,"endMinutes":570}]}',
    "Rules:",
    "- startMinutes/endMinutes are minutes from midnight (09:00 = 540).",
    "- Respect working hours and avoid overlapping existing events.",
    "- Spread tasks from today through the deadline.",
    "- Keep at least 15 minutes per task.",
    "- Include every task from the user list.",
    `- Today is ${today}.`,
    "",
    "Existing calendar events:",
    formatCalendarContext(calendarContext),
    "",
    "User /manage block:",
    userBlock.trim(),
  ].join("\n");
}

function normalizeEventsFromLlm(data: Record<string, unknown>): ManageScheduleEventDraft[] {
  const rows = Array.isArray(data.events) ? data.events : [];
  const events: ManageScheduleEventDraft[] = [];
  for (const item of rows) {
    const row = item as Record<string, unknown>;
    const dateKey = asString(row.dateKey);
    const startMinutes = asNumber(row.startMinutes, 9 * 60);
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

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

function localFallbackSchedule(userBlock: string): ManageScheduleResult {
  const parsed = parseManageBlock(userBlock);
  const today = toDateKey(new Date());
  const dateKeys = enumerateDateKeys(today, parsed.deadline);
  const calendar = useCalendarStore.getState();
  const scheduled: ManageScheduleEventDraft[] = [];

  let taskIndex = 0;
  for (const dateKey of dateKeys) {
    if (taskIndex >= parsed.tasks.length) break;
    const dayEvents = calendar.eventsForDate(dateKey);
    let cursor = parsed.workStartMinutes;

    while (taskIndex < parsed.tasks.length && cursor + parsed.defaultDurationMinutes <= parsed.workEndMinutes) {
      const endMinutes = cursor + parsed.defaultDurationMinutes;
      const conflict = dayEvents.some((event) =>
        overlaps(cursor, endMinutes, event.startMinutes, event.endMinutes),
      ) || scheduled.some(
        (event) =>
          event.dateKey === dateKey &&
          overlaps(cursor, endMinutes, event.startMinutes, event.endMinutes),
      );

      if (conflict) {
        cursor += 15;
        continue;
      }

      scheduled.push({
        title: parsed.tasks[taskIndex]!,
        dateKey,
        startMinutes: cursor,
        endMinutes,
        detail: "Scheduled by /manage",
      });
      taskIndex += 1;
      cursor = endMinutes + 10;
    }
  }

  if (scheduled.length === 0) {
    return {
      applied: false,
      summary: "Impossible de planifier automatiquement. Vérifiez la deadline et les créneaux disponibles.",
      events: [],
      firstDateKey: null,
    };
  }

  return {
    applied: true,
    summary: formatManageScheduleSummary(
      "Planification locale (AI indisponible)",
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

function applyEvents(events: ManageScheduleEventDraft[]): CalendarEvent[] {
  const now = Date.now();
  const payload: CalendarEvent[] = events.map((event, index) => ({
    id: `manage-${now}-${index}`,
    dateKey: event.dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
    title: event.title,
    detail: event.detail,
    source: "manage-skill",
  }));
  useCalendarStore.getState().addEvents(payload);
  void syncEventsToGoogleCalendar(
    payload.map((event) => ({
      title: event.title,
      detail: event.detail,
      dateKey: event.dateKey,
      startMinutes: event.startMinutes,
      endMinutes: event.endMinutes,
    })),
  ).then(() => {
    window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
  });
  return payload;
}

export async function runManageScheduleSkill(
  userBlock: string,
  signal?: AbortSignal,
  draft?: ManageSchedulePromptDraft,
): Promise<ManageScheduleResult> {
  if (!isManageSchedulePrompt(userBlock) && !draft) {
    return { applied: false, summary: "", events: [], firstDateKey: null };
  }

  const parsed = draft
    ? {
        deadline: draft.deadline.trim() || defaultManageDeadlineFromParsed(),
        workStartMinutes: 9 * 60,
        workEndMinutes: 18 * 60,
        defaultDurationMinutes: 30,
        tasks: draft.tasks.map((t) => t.trim()).filter(Boolean),
      }
    : parseManageBlock(userBlock);
  const today = toDateKey(new Date());
  const dateKeys = enumerateDateKeys(today, parsed.deadline);
  const calendarContext = gatherCalendarContext(dateKeys);
  const prompt = buildManageScheduleAiPrompt(
    draft ? formatParsedBlockForAi(parsed) : userBlock,
    calendarContext,
  );

  try {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await api.chat(prompt, "auto", [], signal);
    const data = parseJsonFromLlm(response.message);
    const events = normalizeEventsFromLlm(data);
    if (events.length === 0) throw new Error("Aucun événement");

    applyEvents(events);
    const intro = asString(data.summary, `${events.length} tâche(s) planifiée(s) dans votre calendrier.`);
    useNotificationsStore.getState().push({
      kind: "new_feature",
      title: "Calendrier mis à jour",
      body: `${events.length} tâche(s) ajoutée(s) par /manage.`,
    });

    return {
      applied: true,
      summary: formatManageScheduleSummary(intro, events),
      events,
      firstDateKey: events[0]?.dateKey ?? null,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const fallback = localFallbackSchedule(
      draft ? formatParsedBlockForAi(parsed) : userBlock,
    );
    if (fallback.applied) {
      applyEvents(fallback.events);
      useNotificationsStore.getState().push({
        kind: "new_feature",
        title: "Calendrier mis à jour",
        body: `${fallback.events.length} tâche(s) ajoutée(s) par /manage.`,
      });
    }
    return fallback;
  }
}
