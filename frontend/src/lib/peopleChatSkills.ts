import { ArrowRightLeft, CalendarDays, UsersRound, type LucideIcon } from "lucide-react";
import type { ChatSkillDef } from "./chatSkills";
import { CREATE_GROUP_COMPOSER_TEXT } from "./createGroupSkill";
import { MANAGE_COMPOSER_TEMPLATE } from "./manageSchedulePrompt";

export const PEOPLE_MANAGE_SKILL_TEMPLATE = `/manage`;
export const PEOPLE_GROUP_SKILL_TEMPLATE = `/group`;
export const PEOPLE_HANDOFF_SKILL_TEMPLATE = `/handoff`;

export const PEOPLE_GROUP_SKILL_PRESET = `${PEOPLE_GROUP_SKILL_TEMPLATE} ${CREATE_GROUP_COMPOSER_TEXT}`;

export const PEOPLE_CHAT_SKILLS: ChatSkillDef[] = [
  {
    id: "manage",
    slash: "manage",
    label: "/manage",
    description: "Schedule tasks on everyone's calendar in this chat before a deadline (Pro)",
    icon: CalendarDays,
    template: MANAGE_COMPOSER_TEMPLATE,
    requiresPaidPlan: true,
  },
  {
    id: "group",
    slash: "group",
    label: "/group",
    description: "Create a group chat starting with people from this conversation",
    icon: UsersRound,
    template: PEOPLE_GROUP_SKILL_PRESET,
  },
  {
    id: "handoff",
    slash: "handoff",
    label: "/handoff",
    description: "Share selected messages with someone else or a group chat",
    icon: ArrowRightLeft,
    template: `${PEOPLE_HANDOFF_SKILL_TEMPLATE} `,
  },
];

export function filterPeopleChatSkills(query: string): ChatSkillDef[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  return PEOPLE_CHAT_SKILLS.filter(
    (skill) =>
      !q ||
      skill.slash.includes(q) ||
      skill.label.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q),
  );
}
