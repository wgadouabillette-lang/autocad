import type { CalendarAddDraft } from "./chatActionIntents";

export type PluginActionKind = "calendar.add" | "spotify.play" | "gmail.send" | "volume.down";

export interface GmailSendDraft {
  to: string[];
  subject: string;
  body: string;
}

export interface PluginActionDraft {
  kind: PluginActionKind;
  button: "Add" | "Play" | "Send" | "Down";
  /** Present for volume.down. `level` is a percent from 0 to 100. */
  volume?: { step?: string; level?: string };
  calendar?: CalendarAddDraft;
  query?: string;
  mail?: GmailSendDraft;
}

export interface StoredPluginAction extends PluginActionDraft {
  applied?: boolean;
  error?: string;
}

const PLUGIN_BLOCK_RE = /\[PLUGIN\]([\s\S]*?)\[\/PLUGIN\]/i;
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function buildPluginActionPrompt(connectors: { id: string; connected: boolean }[]): string {
  const connected = (id: string) =>
    connectors.find((entry) => entry.id === id)?.connected ? "connected" : "not connected";

  return [
    "Meetra plugins. Use one only when the user wants that action done, not when they ask how it works.",
    "Reply first in the user's language. If every required field is present, append the hidden block below.",
    "If a required field is missing, ask only for that field and do not append the block.",
    "Do not invent a date, a time, a song, a recipient, or an email body.",
    "",
    `Google Calendar sync: ${connected("calendar")}. Meetra calendar Add works even when Google is not connected.`,
    `Spotify: ${connected("spotify")}. Propose Play only if Spotify is connected.`,
    `Gmail: ${connected("gmail")}. Propose Send only if Gmail is connected.`,
    "",
    "[PLUGIN]",
    "kind: calendar.add | spotify.play | gmail.send | volume.down",
    "button: Add | Play | Send | Down",
    "title: event title",
    "date: YYYY-MM-DD",
    "start: HH:MM",
    "end: HH:MM",
    "query: song title and artist",
    "step: little | normal | lot | half | mute",
    "level: 0-100",
    "to: email@example.com",
    "subject: email subject",
    "body: email body",
    "[/PLUGIN]",
    "",
    "Include only the fields for the chosen kind. calendar.add needs title, date, start, and end.",
    "spotify.play needs query. gmail.send needs to, subject, and body.",
    "volume.down is for any request to make playback quieter, however it is phrased.",
    "Use level when the user names a percentage. Use mute for silence, half to cut the volume in half,",
    "little for a small change, lot for a big one, otherwise normal. The app applies it immediately.",
    "Add, Play, and Send wait for a click. volume.down runs immediately.",
    "If a later note asks for markdown, still append this block when the action is ready.",
  ].join("\n");
}

export function stripPluginActionBlock(text: string): string {
  return text.replace(PLUGIN_BLOCK_RE, "").trim();
}

function clockToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let capturingBody = false;
  const body: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (capturingBody) {
      body.push(line);
      continue;
    }
    const match = line.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    if (key === "body") {
      capturingBody = true;
      if (match[2]?.trim()) body.push(match[2].trim());
      continue;
    }
    fields[key] = (match[2] ?? "").trim();
  }
  if (capturingBody) fields.body = body.join("\n").trim();
  return fields;
}

export function parsePluginActionBlock(text: string): PluginActionDraft | null {
  const match = text.match(PLUGIN_BLOCK_RE);
  if (!match?.[1]) return null;
  const fields = parseFields(match[1]);
  const kind = fields.kind?.trim().toLowerCase();

  if (kind === "calendar.add") {
    const title = fields.title?.trim();
    const dateKey = fields.date?.trim();
    const startMinutes = clockToMinutes(fields.start ?? "");
    const endMinutes = clockToMinutes(fields.end ?? "");
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "") || startMinutes == null) return null;
    const end =
      endMinutes != null && endMinutes > startMinutes
        ? endMinutes
        : Math.min(startMinutes + 60, 24 * 60 - 1);
    return {
      kind: "calendar.add",
      button: "Add",
      calendar: { title, dateKey: dateKey!, startMinutes, endMinutes: end },
    };
  }

  if (kind === "spotify.play") {
    const query = fields.query?.trim();
    if (!query || query.length < 2) return null;
    return { kind: "spotify.play", button: "Play", query };
  }

  if (kind === "volume.down") {
    return {
      kind: "volume.down",
      button: "Down",
      volume: {
        step: fields.step?.trim() || undefined,
        level: fields.level?.trim() || undefined,
      },
    };
  }

  if (kind === "gmail.send") {
    const to = (fields.to ?? "")
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter((entry) => EMAIL_RE.test(entry));
    const subject = fields.subject?.trim();
    const body = fields.body?.trim();
    if (to.length === 0 || !subject || !body) return null;
    return { kind: "gmail.send", button: "Send", mail: { to, subject, body } };
  }

  return null;
}
