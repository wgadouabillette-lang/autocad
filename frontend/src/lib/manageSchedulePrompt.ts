import { toDateKey } from "./daySchedule";

export interface ManageSchedulePromptDraft {
  tasks: string[];
  deadline: string;
}

export const MANAGE_TASK_PLACEHOLDER = "task";
export const MANAGE_DEADLINE_PLACEHOLDER = "deadline";

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

export function parseManageComposerText(text: string): ManageSchedulePromptDraft | null {
  const trimmed = text.trim();
  const natural = trimmed.match(/need to do\s+(.+?)\s+before\s+([^,\n.]+)/i);
  if (!natural) return null;

  const tasks = natural[1]!
    .split(/,\s*|\s+(?:and|et)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    tasks: tasks.length > 0 ? tasks : [""],
    deadline: natural[2]?.trim() ?? "",
  };
}

export function createDefaultManageDraft(): ManageSchedulePromptDraft {
  return {
    tasks: [""],
    deadline: "",
  };
}

export function isManageDraftReady(draft: ManageSchedulePromptDraft): boolean {
  return (
    draft.tasks.some((task) => task.trim().length > 0) && draft.deadline.trim().length > 0
  );
}

export function buildManageSkillPayload(draft: ManageSchedulePromptDraft): {
  displayText: string;
  skillText: string;
  managePrompt: ManageSchedulePromptDraft;
} {
  const tasks = draft.tasks.map((task) => task.trim()).filter(Boolean);
  const deadline = draft.deadline.trim();
  const displayText = `I need to do ${tasks.join(", ")} before ${deadline}, taking into account my current schedule.`;
  const skillText = [
    "/manage",
    displayText,
    "",
    `Deadline: ${deadline}`,
    "Tasks:",
    ...tasks.map((task) => `- ${task}`),
  ].join("\n");

  return {
    displayText,
    skillText,
    managePrompt: { tasks, deadline },
  };
}

/** Parse une phrase /manage naturelle (rétrocompat + affichage). */
export function parseManagePromptFromText(text: string): ManageSchedulePromptDraft | null {
  const trimmed = text.trim();
  if (!/(?:^|\s)\/manage\b/i.test(trimmed)) return null;

  const deadlineLine = trimmed.match(/^deadline:\s*(.+)$/im);
  const taskLines = [...trimmed.matchAll(/^[-*•]\s*(.+)$/gm)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((title) => title.length > 0);

  if (deadlineLine || taskLines.length > 0) {
    return {
      tasks: taskLines.length > 0 ? taskLines : [""],
      deadline: deadlineLine?.[1]?.trim() ?? "",
    };
  }

  const natural =
    trimmed.match(/need to do\s+(.+?)\s+before\s+([^,\n.]+)/i) ??
    trimmed.match(/faire\s+(.+?)\s+avant\s+le\s+([^,\n.]+)/i);
  if (!natural) return null;

  const tasks = natural[1]!
    .split(/,\s*|\s+(?:and|et)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    tasks: tasks.length > 0 ? tasks : [""],
    deadline: natural[2]?.trim() ?? "",
  };
}

export function defaultManageDeadlineSuggestion(): string {
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7);
  return toDateKey(fallback);
}
