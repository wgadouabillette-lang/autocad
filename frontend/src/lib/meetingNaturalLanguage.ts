import { api } from "./api";
import { useStore } from "../store/useStore";
import { parseManageDeadline, toDateKey } from "./daySchedule";
import { isNaturalLanguageManageRequest, looksLikeManageComposer } from "./manageSchedulePrompt";
import type { MentionablePerson } from "./promptPeopleMentions";
import {
  parsePeopleMentionsFromText,
  resolvePersonThreadId,
} from "./promptPeopleMentions";
import {
  createDefaultMeetingDraft,
  isMeetingDraftReady,
  runMeetingSkill,
  type MeetingInvitePayload,
  type MeetingPromptDraft,
  type MeetingSkillResult,
} from "./meetingSkill";

const MEETING_INTENT_RE =
  /\b(r[eé]union|meeting|meet(?:ing)?|schedule|planifier|organiser|organize|book|arrange|plan)\b/i;
const TIME_SIGNAL_RE =
  /\b(\d{1,2}\s*h(?:\s*\d{1,2})?|\d{1,2}:\d{2}|from\s+\d|\b\d{1,2}\s*(?:am|pm)\b)/i;
const PEOPLE_SIGNAL_RE = /@[\w.-]+|\b(?:avec|with)\s+\S/i;
const DATE_SIGNAL_RE =
  /\b(demain|tomorrow|aujourd'hui|today|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildTimeString(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseHourMinute(hour: number, minute = 0, meridiem?: string): string {
  let h = hour;
  const m = Math.min(59, Math.max(0, minute));
  if (meridiem) {
    const lower = meridiem.toLowerCase();
    if (lower === "pm" && h < 12) h += 12;
    if (lower === "am" && h === 12) h = 0;
  }
  return buildTimeString(Math.min(23, Math.max(0, h)), m);
}

function parseJsonFromLlm(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON introuvable");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

export function isMeetingSkillPrompt(text: string): boolean {
  return /(?:^|\s)\/meeting\b/i.test(text.trim());
}

export function isNaturalLanguageMeetingRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || isMeetingSkillPrompt(trimmed)) return false;
  if (looksLikeManageComposer(trimmed) || isNaturalLanguageManageRequest(trimmed)) return false;
  if (!MEETING_INTENT_RE.test(trimmed)) return false;
  return (
    TIME_SIGNAL_RE.test(trimmed) ||
    PEOPLE_SIGNAL_RE.test(trimmed) ||
    DATE_SIGNAL_RE.test(trimmed)
  );
}

function parseMeetingDateKey(text: string): string {
  const lower = text.toLowerCase();
  if (/\bdemain\b|\btomorrow\b/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }
  if (/\baujourd'hui\b|\btoday\b/.test(lower)) {
    return toDateKey(new Date());
  }

  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return parseManageDeadline(iso[1]).dateKey;

  const weekday =
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+prochain)?\b/i.exec(
      text,
    );
  if (weekday) return parseManageDeadline(weekday[0]).dateKey;

  return toDateKey(new Date());
}

function parseTimeRange(text: string): { startTime: string; endTime: string } | null {
  const frRange = text.match(
    /\b(\d{1,2})\s*h(?:\s*(\d{1,2}))?\s*(?:à|a|–|-|to)\s*(\d{1,2})\s*h(?:\s*(\d{1,2}))?\b/i,
  );
  if (frRange) {
    const startHour = Number(frRange[1]);
    const startMin = frRange[2] ? Number(frRange[2]) : 0;
    const endHour = Number(frRange[3]);
    const endMin = frRange[4] ? Number(frRange[4]) : 0;
    return {
      startTime: parseHourMinute(startHour, startMin),
      endTime: parseHourMinute(endHour, endMin),
    };
  }

  const colonRange = text.match(
    /\b(\d{1,2}):(\d{2})\s*(?:à|a|–|-|to)\s*(\d{1,2}):(\d{2})\b/i,
  );
  if (colonRange) {
    return {
      startTime: parseHourMinute(Number(colonRange[1]), Number(colonRange[2])),
      endTime: parseHourMinute(Number(colonRange[3]), Number(colonRange[4])),
    };
  }

  const enRange = text.match(
    /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
  );
  if (enRange) {
    const startMeridiem = enRange[3] ?? enRange[6];
    const endMeridiem = enRange[6] ?? enRange[3];
    return {
      startTime: parseHourMinute(Number(enRange[1]), Number(enRange[2] ?? 0), startMeridiem),
      endTime: parseHourMinute(Number(enRange[4]), Number(enRange[5] ?? 0), endMeridiem),
    };
  }

  const singleFr = text.match(/\b(?:à|a|de|from|at)\s+(\d{1,2})\s*h(?:\s*(\d{1,2}))?\b/i);
  if (singleFr) {
    const startHour = Number(singleFr[1]);
    const startMin = singleFr[2] ? Number(singleFr[2]) : 0;
    const startTime = parseHourMinute(startHour, startMin);
    const endHour = Math.min(23, startHour + 1);
    return { startTime, endTime: parseHourMinute(endHour, startMin) };
  }

  const singleEn = text.match(/\b(?:at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (singleEn) {
    const startHour = Number(singleEn[1]);
    const startMin = Number(singleEn[2] ?? 0);
    const startTime = parseHourMinute(startHour, startMin, singleEn[3]);
    const endHour = Math.min(23, startHour + 1);
    return { startTime, endTime: parseHourMinute(endHour, startMin, singleEn[3]) };
  }

  return null;
}

function matchPeopleFromNaturalLanguage(
  text: string,
  people: MentionablePerson[],
): MentionablePerson[] {
  const fromMentions = parsePeopleMentionsFromText(text, people);
  const seen = new Set(fromMentions.map((entry) => entry.person.id));
  const found = [...fromMentions];

  for (const target of people) {
    if (seen.has(target.person.id)) continue;
    const fullName = target.person.name.trim();
    const firstName = fullName.split(/\s+/)[0];
    if (!firstName) continue;

    const patterns = [fullName, firstName, target.mention].map((name) =>
      new RegExp(`\\b(?:avec|with)\\s+@?${escapeRegex(name)}\\b`, "i"),
    );
    if (patterns.some((re) => re.test(text))) {
      seen.add(target.person.id);
      found.push(target);
    }
  }

  return found;
}

function attendeesTokens(mentions: MentionablePerson[]): string {
  return mentions.map((m) => `@${m.mention}`).join(" ");
}

function inferTitle(text: string, mentions: MentionablePerson[]): string {
  let cleaned = text
    .replace(MEETING_INTENT_RE, " ")
    .replace(/\b(?:avec|with)\s+@?\S+/gi, " ")
    .replace(TIME_SIGNAL_RE, " ")
    .replace(DATE_SIGNAL_RE, " ")
    .replace(/@\S+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 3) {
    if (mentions.length === 1) return `Réunion avec ${mentions[0]!.person.name}`;
    return "Réunion";
  }

  cleaned = cleaned.replace(/^(?:une|un|la|le|a|an|the)\s+/i, "").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export interface ParsedNaturalLanguageMeeting {
  draft: MeetingPromptDraft;
  mentions: MentionablePerson[];
  complete: boolean;
}

export function parseNaturalLanguageMeeting(
  text: string,
  mentionablePeople: MentionablePerson[],
): ParsedNaturalLanguageMeeting {
  const mentions = matchPeopleFromNaturalLanguage(text, mentionablePeople);
  const timeRange = parseTimeRange(text);
  const defaults = createDefaultMeetingDraft();
  const draft: MeetingPromptDraft = {
    title: inferTitle(text, mentions),
    attendees: attendeesTokens(mentions),
    dateKey: parseMeetingDateKey(text),
    startTime: timeRange?.startTime ?? defaults.startTime,
    endTime: timeRange?.endTime ?? defaults.endTime,
  };

  const complete = mentions.length > 0 && isMeetingDraftReady(draft, mentionablePeople);
  return { draft, mentions, complete };
}

async function llmParseNaturalLanguageMeeting(
  text: string,
  mentionablePeople: MentionablePerson[],
  signal?: AbortSignal,
): Promise<ParsedNaturalLanguageMeeting | null> {
  const peopleList = mentionablePeople
    .map((entry) => `${entry.person.name} (@${entry.mention})`)
    .join(", ");
  const prompt = [
    "Extract meeting scheduling details from the user message.",
    `Today is ${toDateKey(new Date())}.`,
    peopleList ? `Mentionable people: ${peopleList}` : "No mentionable people provided.",
    "Reply with JSON only:",
    `{ "title": "string", "attendeeMentions": ["handle"], "dateKey": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM" }`,
    "",
    `User message: ${text}`,
  ].join("\n");

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const workspaceId = useStore.getState().activeRoomId;
  const response = await api.chat(prompt, "auto", [], signal, undefined, workspaceId);
  const data = parseJsonFromLlm(response.message);

  const attendeeMentions = Array.isArray(data.attendeeMentions)
    ? data.attendeeMentions.filter((value): value is string => typeof value === "string")
    : [];
  const attendeesText = attendeeMentions.map((handle) => `@${handle.replace(/^@/, "")}`).join(" ");
  const fromMentions = parsePeopleMentionsFromText(
    attendeesText || text,
    mentionablePeople,
  );
  const mentions =
    fromMentions.length > 0
      ? fromMentions
      : matchPeopleFromNaturalLanguage(text, mentionablePeople);

  const dateKey =
    typeof data.dateKey === "string" && data.dateKey.trim()
      ? parseManageDeadline(data.dateKey.trim()).dateKey
      : parseMeetingDateKey(text);
  const startTime =
    typeof data.startTime === "string" && /^\d{1,2}:\d{2}$/.test(data.startTime.trim())
      ? data.startTime.trim()
      : createDefaultMeetingDraft().startTime;
  const endTime =
    typeof data.endTime === "string" && /^\d{1,2}:\d{2}$/.test(data.endTime.trim())
      ? data.endTime.trim()
      : createDefaultMeetingDraft().endTime;

  const draft: MeetingPromptDraft = {
    title:
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : inferTitle(text, mentions),
    attendees: attendeesTokens(mentions),
    dateKey,
    startTime,
    endTime,
  };

  return {
    draft,
    mentions,
    complete: mentions.length > 0 && isMeetingDraftReady(draft, mentionablePeople),
  };
}

export async function runNaturalLanguageMeetingSkill(input: {
  text: string;
  mentionable: MentionablePerson[];
  workspaceId: string;
  organizerName: string;
  sendMeetingInvite: (threadId: string, payload: MeetingInvitePayload) => void | Promise<void>;
  ensureColleagueThread: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => string;
  signal?: AbortSignal;
}): Promise<MeetingSkillResult> {
  let parsed = parseNaturalLanguageMeeting(input.text, input.mentionable);

  if (!parsed.complete) {
    try {
      const llmParsed = await llmParseNaturalLanguageMeeting(
        input.text,
        input.mentionable,
        input.signal,
      );
      if (llmParsed?.complete) parsed = llmParsed;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
    }
  }

  if (parsed.mentions.length === 0) {
    return {
      ok: false,
      summary: "",
      invitedCount: 0,
      error:
        "Indiquez au moins une personne (@mention ou « avec Alice ») pour planifier la réunion.",
    };
  }

  if (!isMeetingDraftReady(parsed.draft, input.mentionable)) {
    return {
      ok: false,
      summary: "",
      invitedCount: 0,
      error:
        "Je n'ai pas pu extraire la date ou les horaires. Précisez par ex. « demain de 14h à 15h ».",
    };
  }

  return runMeetingSkill({
    draft: parsed.draft,
    mentions: parsed.mentions,
    workspaceId: input.workspaceId,
    organizerName: input.organizerName,
    sendMeetingInvite: input.sendMeetingInvite,
    ensureColleagueThread: input.ensureColleagueThread,
  });
}

export { resolvePersonThreadId };
