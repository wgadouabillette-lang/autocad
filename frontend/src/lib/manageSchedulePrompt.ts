import { toDateKey } from "./daySchedule";

export interface ManageSchedulePromptDraft {
  tasks: string[];
  deadline: string;
}

export const MANAGE_TASK_PLACEHOLDER = "task";
export const MANAGE_DEADLINE_PLACEHOLDER = "deadline";

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
