import type { SkillTimelineStep } from "../components/chat/SkillTimeline";

export type SkillTimelineId = "manage" | "group" | "handoff" | "recap" | "play" | "meeting" | "mail";

const PROCESSING_STEP: SkillTimelineStep = {
  id: "processing",
  label: "Processing",
  minMs: 1500,
  maxMs: 2500,
};

const CONNECTING_STEP: SkillTimelineStep = {
  id: "connecting",
  label: "Connecting to your account",
  minMs: 2500,
  maxMs: 3000,
};

const FINALIZING_STEP: SkillTimelineStep = {
  id: "finalizing",
  label: "Finalizing setup",
  minMs: 1500,
};

export const MANAGE_TIMELINE_STEPS: SkillTimelineStep[] = [
  PROCESSING_STEP,
  CONNECTING_STEP,
  FINALIZING_STEP,
];

export const RECAP_TIMELINE_STEPS: SkillTimelineStep[] = [
  PROCESSING_STEP,
  CONNECTING_STEP,
  FINALIZING_STEP,
];

export const GROUP_TIMELINE_STEPS: SkillTimelineStep[] = [
  PROCESSING_STEP,
  FINALIZING_STEP,
];

export const HANDOFF_TIMELINE_STEPS: SkillTimelineStep[] = [
  {
    id: "sending",
    label: "Sending chat",
    minMs: 2000,
    maxMs: 2000,
  },
];

export const MEETING_TIMELINE_STEPS: SkillTimelineStep[] = [
  {
    id: "calendar",
    label: "Adding to calendar",
    minMs: 1200,
    maxMs: 1800,
  },
  {
    id: "invites",
    label: "Sending invites",
    minMs: 1200,
    maxMs: 1800,
  },
];

export const MAIL_TIMELINE_STEPS: SkillTimelineStep[] = [
  {
    id: "resolve",
    label: "Resolving recipients",
    minMs: 1000,
    maxMs: 1500,
  },
  {
    id: "send",
    label: "Sending via Gmail",
    minMs: 1200,
    maxMs: 2000,
  },
];

export function buildPlayTimelineSteps(query: string): SkillTimelineStep[] {
  const trimmed = query.trim();
  const label = trimmed ? `Searching "${trimmed}"` : "Searching";
  return [
    {
      id: "searching",
      label,
      minMs: 1500,
      maxMs: 2500,
    },
  ];
}

export const SKILL_SUCCESS_LABELS: Record<SkillTimelineId, string> = {
  manage: "Tasks scheduled",
  recap: "Recap saved",
  group: "Group created",
  handoff: "Handoff sent",
  play: "Now playing",
  meeting: "Meeting scheduled",
  mail: "Email sent",
};

export const SKILL_ACTION_LABELS: Partial<Record<SkillTimelineId, string>> = {
  manage: "View deadlines",
  recap: "View note",
  group: "View group",
  meeting: "View calendar",
};
