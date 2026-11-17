import { isValidDate, parseDateKey } from "./daySchedule";

const CALL_LINE = /^meetra-call:([a-z0-9-]{4,32})$/i;
const JOIN_LEAD_MS = 5 * 60 * 1000;

/** Ligne rangée dans le détail pour retrouver l’appel après un rechargement. */
export function directCallDetailLine(callId: string): string {
  return `meetra-call:${callId}`;
}

/** Sépare l’identifiant d’appel du texte visible de l’événement. */
export function readDirectCallId(detail?: string | null): { callId?: string; detail?: string } {
  if (!detail?.trim()) return {};
  let callId: string | undefined;
  const visible: string[] = [];
  for (const line of detail.split("\n")) {
    const match = line.trim().match(CALL_LINE);
    if (match) callId = match[1].toLowerCase();
    else if (line.trim()) visible.push(line);
  }
  return { callId, detail: visible.join("\n") || undefined };
}

export function directCallStartMs(dateKey: string, startMinutes: number): number | null {
  const date = parseDateKey(dateKey);
  if (!isValidDate(date)) return null;
  return date.getTime() + startMinutes * 60 * 1000;
}

/** Vrai dès 5 minutes avant le début, jusqu’à la fin de l’événement. */
export function isDirectCallJoinWindow(
  dateKey: string,
  startMinutes: number,
  endMinutes: number,
  nowMs: number,
): boolean {
  const startMs = directCallStartMs(dateKey, startMinutes);
  if (startMs === null) return false;
  const endMs = startMs + Math.max(0, endMinutes - startMinutes) * 60 * 1000;
  return nowMs >= startMs - JOIN_LEAD_MS && nowMs < endMs;
}
