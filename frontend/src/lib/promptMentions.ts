import { PROMPT_ACTIONS } from "./promptActions";
import type { FaceRegion } from "./faceReference";
import { FACE_MENTION_BY_REGION } from "./faceReference";

const FACE_MENTIONS = Object.values(FACE_MENTION_BY_REGION);
const ACTION_MENTIONS = PROMPT_ACTIONS.map((a) => a.mention);
const STATIC_MENTION_NAMES = [...FACE_MENTIONS, ...ACTION_MENTIONS]
  .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/** Mentions @ reconnues dans le champ (faces + actions, sans personnes). */
export const PROMPT_MENTION_REGEX = new RegExp(
  `@(?:${STATIC_MENTION_NAMES})(?=\\s|$)`,
  "gi",
);

function buildMentionRegex(peopleHandles: string[] = []) {
  const people = peopleHandles
    .map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const names = people ? `${STATIC_MENTION_NAMES}|${people}` : STATIC_MENTION_NAMES;
  return new RegExp(`@(?:${names})(?=\\s|$)`, "gi");
}

export interface PromptDisplaySegment {
  text: string;
  mention: boolean;
}

export function getMentionMatchRanges(
  text: string,
  peopleHandles: string[] = [],
): Array<{ start: number; end: number }> {
  const re = buildMentionRegex(peopleHandles);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  return ranges;
}

export function parsePromptDisplaySegments(
  text: string,
  peopleHandles: string[] = [],
): PromptDisplaySegment[] {
  if (!text) return [];
  const re = buildMentionRegex(peopleHandles);
  const segments: PromptDisplaySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ text: text.slice(last, start), mention: false });
    segments.push({ text: m[0], mention: true });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), mention: false });
  return segments;
}

export function textContainsFaceMention(text: string, mention: string): boolean {
  return new RegExp(`@${mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "i").test(text);
}

export function faceRegionFromMention(mention: string): FaceRegion | null {
  const entry = Object.entries(FACE_MENTION_BY_REGION).find(([, m]) => m.toLowerCase() === mention.toLowerCase());
  return entry ? (entry[0] as FaceRegion) : null;
}
