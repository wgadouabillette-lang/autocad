import { ArrowRightLeft, CalendarDays, FileText, Music2, UsersRound, type LucideIcon } from "lucide-react";
import { CREATE_GROUP_COMPOSER_TEXT } from "./createGroupSkill";
import { MANAGE_COMPOSER_TEMPLATE } from "./manageSchedulePrompt";
import { PLAY_SKILL_TEMPLATE } from "./playSkill";

export interface ChatSkillDef {
  id: string;
  slash: string;
  label: string;
  description: string;
  icon: LucideIcon;
  template: string;
  requiresPaidPlan?: boolean;
}

export const MANAGE_SKILL_TEMPLATE = `/manage`;
export const CREATE_GROUP_SKILL_TEMPLATE = `/group`;
export const GROUP_SKILL_TEMPLATE = CREATE_GROUP_SKILL_TEMPLATE;
export const RECAP_SKILL_TEMPLATE = `/recap`;
export const HANDOFF_SKILL_TEMPLATE = `/handoff`;

export { MANAGE_COMPOSER_TEMPLATE, CREATE_GROUP_COMPOSER_TEXT, PLAY_SKILL_TEMPLATE };

export const CHAT_SKILLS: ChatSkillDef[] = [
  {
    id: "manage",
    slash: "manage",
    label: "/manage",
    description: "Schedule tasks into your calendar before a deadline",
    icon: CalendarDays,
    template: MANAGE_SKILL_TEMPLATE,
  },
  {
    id: "group",
    slash: "group",
    label: "/group",
    description: "Create a group chat with friends or workspace members",
    icon: UsersRound,
    template: CREATE_GROUP_SKILL_TEMPLATE,
  },
  {
    id: "handoff",
    slash: "handoff",
    label: "/handoff",
    description: "Share selected chat messages with a teammate",
    icon: ArrowRightLeft,
    template: HANDOFF_SKILL_TEMPLATE,
  },
  {
    id: "play",
    slash: "play",
    label: "/play",
    description: "Play a song on Spotify",
    icon: Music2,
    template: PLAY_SKILL_TEMPLATE,
  },
  {
    id: "recap",
    slash: "recap",
    label: "/recap",
    description: "Turn a recording into a structured recap note (Pro)",
    icon: FileText,
    template: RECAP_SKILL_TEMPLATE,
    requiresPaidPlan: true,
  },
];

export function chatSkillBySlash(slash: string): ChatSkillDef | undefined {
  const normalized = slash.trim().toLowerCase().replace(/^\//, "");
  return CHAT_SKILLS.find((skill) => skill.slash === normalized);
}

export function filterChatSkills(query: string): ChatSkillDef[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  return CHAT_SKILLS.filter(
    (skill) =>
      !q ||
      skill.slash.includes(q) ||
      skill.label.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q),
  );
}

export function isManageSchedulePrompt(text: string): boolean {
  return /(?:^|\s)\/manage\b/i.test(text.trim());
}

export { isPlaySkillPrompt } from "./playSkill";
