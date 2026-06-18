import { getMentionMatchRanges } from "./promptMentions";
import { getManageComposerChipRanges } from "./manageSchedulePrompt";

export type ComposerHighlightKind = "plain" | "mention" | "skillChip";
export type ComposerSkillMode = "manage" | "group" | null;

export interface ComposerHighlightSegment {
  text: string;
  kind: ComposerHighlightKind;
  empty?: boolean;
}

type HighlightRange = { start: number; end: number; kind: ComposerHighlightKind };

export function parseComposerHighlightSegments(
  text: string,
  peopleHandles: string[] = [],
  composerSkill: ComposerSkillMode = null,
): ComposerHighlightSegment[] {
  if (!text) return [];

  const manageRanges = getManageComposerChipRanges(text, {
    lenient: composerSkill === "manage",
  });

  const ranges: HighlightRange[] = [
    ...manageRanges.map((range) => ({
      ...range,
      kind: "skillChip" as const,
    })),
    ...getMentionMatchRanges(text, peopleHandles).map((range) => ({
      ...range,
      kind: "mention" as const,
    })),
  ].sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: HighlightRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (!last || range.start >= last.end) {
      merged.push(range);
      continue;
    }
    if (range.end > last.end) {
      last.end = range.end;
      last.kind = range.kind;
    }
  }

  const segments: ComposerHighlightSegment[] = [];
  let pos = 0;
  for (const range of merged) {
    if (range.start > pos) {
      segments.push({ text: text.slice(pos, range.start), kind: "plain" });
    }
    if (range.end > pos) {
      const start = Math.max(pos, range.start);
      const slice = text.slice(start, range.end);
      segments.push({
        text: slice,
        kind: range.kind,
        empty: range.kind === "skillChip" && slice.length === 0,
      });
      pos = range.end;
    }
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), kind: "plain" });
  }
  return segments;
}
