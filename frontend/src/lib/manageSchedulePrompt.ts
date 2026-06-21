import { coerceDateKey, normalizeDateKey } from "./daySchedule";

export interface ManageScheduleTask {
  title: string;
  durationMinutes?: number;
}

export interface ManageSchedulePromptDraft {
  tasks: ManageScheduleTask[];
  deadline: string;
}

export const DEFAULT_MANAGE_TASK_DURATION_MINUTES = 30;
export const MIN_MANAGE_TASK_DURATION_MINUTES = 15;

export const MANAGE_TASK_PLACEHOLDER = "task";
export const MANAGE_DEADLINE_PLACEHOLDER = "deadline";
export const MANAGE_DURATION_PLACEHOLDER = "30 min";

const MANAGE_COMPOSER_PREFIX = "I need to do ";
const MANAGE_COMPOSER_MIDDLE = " before ";
const MANAGE_COMPOSER_SUFFIX = ", taking into account my current schedule.";

export const MANAGE_COMPOSER_TEMPLATE = `${MANAGE_COMPOSER_PREFIX}${MANAGE_TASK_PLACEHOLDER}${MANAGE_COMPOSER_MIDDLE}${MANAGE_DEADLINE_PLACEHOLDER}${MANAGE_COMPOSER_SUFFIX}`;

export function manageComposerTaskSelection(): { start: number; end: number } {
  const start = MANAGE_COMPOSER_TEMPLATE.indexOf(MANAGE_TASK_PLACEHOLDER);
  return { start, end: start + MANAGE_TASK_PLACEHOLDER.length };
}

export function getManageComposerChipRanges(
  text: string,
  options?: { lenient?: boolean },
): Array<{ start: number; end: number }> {
  const strict = getManageComposerChipRangesStrict(text);
  if (strict.length > 0 || !options?.lenient) return strict;
  return getManageComposerChipRangesLenient(text);
}

function getManageComposerChipRangesStrict(text: string): Array<{ start: number; end: number }> {
  if (!text.startsWith(MANAGE_COMPOSER_PREFIX) || !text.endsWith(MANAGE_COMPOSER_SUFFIX)) {
    return [];
  }
  const inner = text.slice(
    MANAGE_COMPOSER_PREFIX.length,
    text.length - MANAGE_COMPOSER_SUFFIX.length,
  );
  const beforeIdx = inner.indexOf(MANAGE_COMPOSER_MIDDLE);
  if (beforeIdx < 0) return [];

  const taskStart = MANAGE_COMPOSER_PREFIX.length;
  const taskEnd = taskStart + beforeIdx;
  const deadlineStart = taskEnd + MANAGE_COMPOSER_MIDDLE.length;
  const deadlineEnd = text.length - MANAGE_COMPOSER_SUFFIX.length;
  return [
    { start: taskStart, end: taskEnd },
    { start: deadlineStart, end: deadlineEnd },
  ];
}

export function looksLikeManageComposer(text: string): boolean {
  return /need to do\s/i.test(text) && /\sbefore\s/i.test(text);
}

const MANAGE_SLASH_RE = /(?:^|\s)\/manage\b/i;

const NL_MANAGE_DEADLINE_RE =
  /\b(?:avant|before|d'ici|by)\s+(?:le\s+|the\s+)?(?:\d{1,2}\s+[a-zàâäéèêëïîôùûüç]+|\d{4}-\d{2}-\d{2}|demain|tomorrow|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/i;

/** Détecte une demande de planification de tâches en langage naturel (sans `/manage`). */
export function isNaturalLanguageManageRequest(text: string): boolean {
  const t = text.trim();
  if (!t || MANAGE_SLASH_RE.test(t)) return false;
  if (looksLikeManageComposer(t)) return true;

  if (/\b(réunion|meeting|visio|call)\b/i.test(t) && !/\b(tâche|tache|task|faire|do)\b/i.test(t)) {
    return false;
  }

  if (!NL_MANAGE_DEADLINE_RE.test(t)) return false;

  return (
    /\b(?:faire|terminer|finir|accomplir|planifier|organiser|need to|want to|have to|tâches?|taches?|tasks?)\b/i.test(
      t,
    ) || /(?:je\s+(?:veux|dois)|j'ai besoin)/i.test(t)
  );
}

const BEFORE_MARKERS = [" before ", " before", "before "] as const;
const SUFFIX_MARKERS = [
  ", taking into account my current schedule.",
  ", taking into account my current schedule",
  ", taking into account",
  " taking into account my current schedule.",
  " taking into account my current schedule",
  " taking into account",
] as const;

function findEarliestMarker(
  text: string,
  from: number,
  markers: readonly string[],
): { index: number; length: number } | null {
  let found: { index: number; length: number } | null = null;
  for (const marker of markers) {
    const index = text.indexOf(marker, from);
    if (index < 0) continue;
    if (
      !found ||
      index < found.index ||
      (index === found.index && marker.length > found.length)
    ) {
      found = { index, length: marker.length };
    }
  }
  return found;
}

export function getManageComposerChipRangesLenient(
  text: string,
): Array<{ start: number; end: number }> {
  const needMatch = /need to do\s/i.exec(text);
  if (!needMatch) return [];

  const taskStart = needMatch.index + needMatch[0].length;
  const beforeMarker = findEarliestMarker(text, taskStart, BEFORE_MARKERS);
  if (!beforeMarker) return [];

  const taskEnd = beforeMarker.index;
  const deadlineStart = beforeMarker.index + beforeMarker.length;
  const suffixMarker = findEarliestMarker(text, deadlineStart, SUFFIX_MARKERS);
  const deadlineEnd = suffixMarker ? suffixMarker.index : text.length;

  const ranges: Array<{ start: number; end: number }> = [];
  if (taskEnd > taskStart) ranges.push({ start: taskStart, end: taskEnd });
  if (deadlineEnd > deadlineStart) ranges.push({ start: deadlineStart, end: deadlineEnd });
  return ranges;
}

/** Parse "30", "45 min", "1h", "1h30" → minutes. Returns undefined if empty/invalid. */
export function parseDurationMinutes(raw: string): number | undefined {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;

  const hourMin = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*(?:m(?:in(?:ute)?s?)?)?)?$/);
  if (hourMin) {
    const hours = Number(hourMin[1]);
    const mins = hourMin[2] ? Number(hourMin[2]) : 0;
    if (Number.isFinite(hours) && hours >= 0) {
      return Math.round(hours * 60 + (Number.isFinite(mins) ? mins : 0));
    }
  }

  const minMatch = trimmed.match(/^(\d+)\s*(?:min(?:ute)?s?|m)?$/);
  if (minMatch) {
    const minutes = Number(minMatch[1]);
    if (Number.isFinite(minutes) && minutes > 0) return minutes;
  }

  return undefined;
}

export function resolveTaskDurationMinutes(durationMinutes?: number): number {
  const value = durationMinutes ?? DEFAULT_MANAGE_TASK_DURATION_MINUTES;
  return Math.max(MIN_MANAGE_TASK_DURATION_MINUTES, value);
}

export function formatTaskDurationLabel(durationMinutes?: number): string {
  const minutes = resolveTaskDurationMinutes(durationMinutes);
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes} min`;
}

export function formatTaskDurationInput(durationMinutes?: number): string {
  if (durationMinutes == null) return "";
  return formatTaskDurationLabel(durationMinutes);
}

function parseTaskTitleAndDuration(raw: string): ManageScheduleTask {
  const trimmed = raw.trim();
  const parenMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const title = parenMatch[1]!.trim();
    const durationMinutes = parseDurationMinutes(parenMatch[2]!);
    return durationMinutes != null ? { title, durationMinutes } : { title: trimmed };
  }
  return { title: trimmed };
}

export function parseManageComposerText(text: string): ManageSchedulePromptDraft | null {
  const trimmed = text.trim();
  const natural = trimmed.match(/need to do\s+(.+?)\s+before\s+([^,\n.]+)/i);
  if (!natural) return null;

  const tasks = natural[1]!
    .split(/,\s*|\s+(?:and|et)\s+/i)
    .map((part) => parseTaskTitleAndDuration(part))
    .filter((task) => task.title.length > 0);

  return {
    tasks: tasks.length > 0 ? tasks : [{ title: "" }],
    deadline: natural[2]?.trim() ?? "",
  };
}

export function createDefaultManageDraft(): ManageSchedulePromptDraft {
  return {
    tasks: [{ title: "" }],
    deadline: "",
  };
}

/** Rétrocompat : anciens drafts Firestore/chat avec `tasks: string[]`. */
export function normalizeManagePromptDraft(
  draft: ManageSchedulePromptDraft | { tasks: Array<string | ManageScheduleTask>; deadline: string },
): ManageSchedulePromptDraft {
  return {
    deadline: draft.deadline,
    tasks: draft.tasks.map((task) =>
      typeof task === "string" ? { title: task } : task,
    ),
  };
}

export function isManageDraftReady(draft: ManageSchedulePromptDraft): boolean {
  return (
    draft.tasks.some((task) => task.title.trim().length > 0) && draft.deadline.trim().length > 0
  );
}

function normalizeManageTasks(tasks: ManageScheduleTask[]): ManageScheduleTask[] {
  return tasks
    .map((task) => ({
      title: task.title.trim(),
      ...(task.durationMinutes != null ? { durationMinutes: task.durationMinutes } : {}),
    }))
    .filter((task) => task.title.length > 0);
}

export function buildManageSkillPayload(draft: ManageSchedulePromptDraft): {
  displayText: string;
  skillText: string;
  managePrompt: ManageSchedulePromptDraft;
} {
  const tasks = normalizeManageTasks(draft.tasks);
  const deadline = draft.deadline.trim();
  const taskLabels = tasks.map(
    (task) => `${task.title} (${formatTaskDurationLabel(task.durationMinutes)})`,
  );
  const displayText = `I need to do ${taskLabels.join(", ")} before ${deadline}, taking into account my current schedule.`;
  const skillText = [
    "/manage",
    displayText,
    "",
    `Deadline: ${deadline}`,
    "Tasks:",
    ...tasks.map(
      (task) => `- ${task.title} (${formatTaskDurationLabel(task.durationMinutes)})`,
    ),
  ].join("\n");

  return {
    displayText,
    skillText,
    managePrompt: { tasks, deadline },
  };
}

function parseTaskLine(raw: string): ManageScheduleTask | null {
  const trimmed = raw.trim();
  if (!trimmed || /^task title \d+$/i.test(trimmed) || trimmed === "YYYY-MM-DD") {
    return null;
  }
  return parseTaskTitleAndDuration(trimmed);
}

/** Parse une phrase /manage naturelle (rétrocompat + affichage). */
export function parseManagePromptFromText(text: string): ManageSchedulePromptDraft | null {
  const trimmed = text.trim();
  if (!/(?:^|\s)\/manage\b/i.test(trimmed)) return null;

  const deadlineLine = trimmed.match(/^deadline:\s*(.+)$/im);
  const taskLines = [...trimmed.matchAll(/^[-*•]\s*(.+)$/gm)]
    .map((match) => parseTaskLine(match[1] ?? ""))
    .filter((task): task is ManageScheduleTask => task != null);

  if (deadlineLine || taskLines.length > 0) {
    return {
      tasks: taskLines.length > 0 ? taskLines : [{ title: "" }],
      deadline: deadlineLine?.[1]?.trim() ?? "",
    };
  }

  const natural =
    trimmed.match(/need to do\s+(.+?)\s+before\s+([^,\n.]+)/i) ??
    trimmed.match(/faire\s+(.+?)\s+avant\s+le\s+([^,\n.]+)/i);
  if (!natural) return null;

  const tasks = natural[1]!
    .split(/,\s*|\s+(?:and|et)\s+/i)
    .map((part) => parseTaskTitleAndDuration(part))
    .filter((task) => task.title.length > 0);

  return {
    tasks: tasks.length > 0 ? tasks : [{ title: "" }],
    deadline: natural[2]?.trim() ?? "",
  };
}

export function defaultManageDeadlineSuggestion(): string {
  return coerceDateKey("");
}
