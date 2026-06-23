import { createUserCalendarEvents, fetchUserCalendarEvents } from "./calendarEventsApi";
import { formatDayLabel, toDateKey } from "./daySchedule";
import { notifyCalendarEventsChanged } from "../hooks/usePersistedCalendarEvents";
import type { MentionablePerson } from "./promptPeopleMentions";
import {
  parsePeopleMentionsFromText,
  resolvePersonThreadId,
} from "./promptPeopleMentions";
import { useCalendarStore, type CalendarEvent } from "../store/useCalendarStore";

export interface MeetingPromptDraft {
  title: string;
  attendees: string;
  dateKey: string;
  startTime: string;
  endTime: string;
}

export interface MeetingSkillResult {
  ok: boolean;
  summary: string;
  event?: CalendarEvent;
  invitedCount: number;
  error?: string;
}

export interface MeetingInvitePayload {
  title: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  organizerName: string;
  invitationText: string;
}

export {
  isMeetingSkillPrompt,
  isNaturalLanguageMeetingRequest,
  parseNaturalLanguageMeeting,
  runNaturalLanguageMeetingSkill,
} from "./meetingNaturalLanguage";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildTimeString(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseTimeString(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function minutesFromTimeString(value: string): number | null {
  const parsed = parseTimeString(value);
  if (!parsed) return null;
  return parsed.hour * 60 + parsed.minute;
}

function defaultStartTime(): string {
  const now = new Date();
  const hour = Math.min(23, now.getHours() + 1);
  return buildTimeString(hour, 0);
}

function defaultEndTime(startTime: string): string {
  const start = parseTimeString(startTime);
  if (!start) return buildTimeString(Math.min(23, new Date().getHours() + 2), 0);
  return buildTimeString(Math.min(23, start.hour + 1), start.minute);
}

export const MEETING_SKILL_TEMPLATE = `/meeting`;

export function createDefaultMeetingDraft(): MeetingPromptDraft {
  const startTime = defaultStartTime();
  return {
    title: "",
    attendees: "@",
    dateKey: toDateKey(new Date()),
    startTime,
    endTime: defaultEndTime(startTime),
  };
}

export function isMeetingDraftReady(
  draft: MeetingPromptDraft,
  people: MentionablePerson[],
): boolean {
  const mentions = parsePeopleMentionsFromText(draft.attendees, people);
  if (mentions.length === 0) return false;
  const startMinutes = minutesFromTimeString(draft.startTime);
  const endMinutes = minutesFromTimeString(draft.endTime);
  if (startMinutes === null || endMinutes === null) return false;
  if (endMinutes <= startMinutes) return false;
  return draft.dateKey.trim().length > 0;
}

export function buildMeetingDisplayText(
  draft: MeetingPromptDraft,
  mentions: MentionablePerson[],
): string {
  const title = draft.title.trim() || "Réunion";
  const names = mentions.map((m) => `@${m.mention}`).join(" ");
  return `/meeting ${title} · ${names} · ${formatDayLabel(draft.dateKey)} · ${draft.startTime}–${draft.endTime}`;
}

export async function runMeetingSkill(input: {
  draft: MeetingPromptDraft;
  mentions: MentionablePerson[];
  workspaceId: string;
  organizerName: string;
  sendMeetingInvite: (threadId: string, payload: MeetingInvitePayload) => void | Promise<void>;
  ensureColleagueThread: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => string;
}): Promise<MeetingSkillResult> {
  const { draft, mentions, workspaceId, organizerName, sendMeetingInvite, ensureColleagueThread } =
    input;
  const title = draft.title.trim() || "Réunion";
  const startMinutes = minutesFromTimeString(draft.startTime);
  const endMinutes = minutesFromTimeString(draft.endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return {
      ok: false,
      summary: "",
      invitedCount: 0,
      error: "Heures invalides.",
    };
  }

  const event: CalendarEvent = {
    id: `meeting-${draft.dateKey}-${Date.now()}`,
    dateKey: draft.dateKey,
    startMinutes,
    endMinutes,
    title,
    detail:
      mentions.length > 0
        ? `Avec ${mentions.map((m) => m.person.name).join(", ")}`
        : undefined,
    source: "meeting-skill",
  };

  await createUserCalendarEvents(
    [
      {
        title,
        detail: event.detail,
        dateKey: draft.dateKey,
        startMinutes,
        endMinutes,
      },
    ],
    "meeting-skill",
  );
  useCalendarStore.getState().setUserEvents(await fetchUserCalendarEvents());
  notifyCalendarEventsChanged();
  window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));

  const dayLabel = formatDayLabel(draft.dateKey);
  const timeLabel = `${draft.startTime} – ${draft.endTime}`;
  const invitationText = `Invitation : ${title}\n${dayLabel} · ${timeLabel}`;

  for (const target of mentions) {
    const threadId = resolvePersonThreadId(target, workspaceId, ensureColleagueThread);
    sendMeetingInvite(threadId, {
      title,
      dateKey: draft.dateKey,
      startTime: draft.startTime,
      endTime: draft.endTime,
      organizerName,
      invitationText,
    });
  }

  const attendeeNames = mentions.map((m) => m.person.name).join(", ");
  return {
    ok: true,
    summary: `Réunion planifiée le **${dayLabel}** de ${draft.startTime} à ${draft.endTime} avec ${attendeeNames}. L'événement est dans votre calendrier et les invitations ont été envoyées.`,
    event,
    invitedCount: mentions.length,
  };
}
