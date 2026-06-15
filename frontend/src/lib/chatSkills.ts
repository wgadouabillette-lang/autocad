import { CalendarDays, type LucideIcon } from "lucide-react";

export interface ChatSkillDef {
  id: string;
  slash: string;
  label: string;
  description: string;
  icon: LucideIcon;
  template: string;
}

export const MANAGE_SKILL_TEMPLATE = `/manage

Deadline: YYYY-MM-DD
Working hours: 09:00-18:00
Default task duration: 30 minutes

Tasks:
- Task title 1
- Task title 2
- Task title 3
`;

export const CHAT_SKILLS: ChatSkillDef[] = [
  {
    id: "manage",
    slash: "manage",
    label: "/manage",
    description: "Schedule tasks into your calendar before a deadline",
    icon: CalendarDays,
    template: MANAGE_SKILL_TEMPLATE,
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
