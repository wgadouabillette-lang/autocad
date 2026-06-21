import { ArrowRightLeft, CalendarDays, FileText, UsersRound, Video, type LucideIcon } from "lucide-react";
import { CHAT_APP_LOGOS, type ChatAppLogoComponent } from "../components/chat/chatAppLogos";
import { CREATE_GROUP_COMPOSER_TEXT } from "./createGroupSkill";
import { MANAGE_COMPOSER_TEMPLATE } from "./manageSchedulePrompt";
import { PLAY_SKILL_TEMPLATE } from "./playSkill";
import { MEETING_SKILL_TEMPLATE } from "./meetingSkill";

export interface ChatSkillDef {
  id: string;
  slash: string;
  label: string;
  description: string;
  icon?: LucideIcon;
  logo?: ChatAppLogoComponent;
  template: string;
  requiresPaidPlan?: boolean;
}

export const MANAGE_SKILL_TEMPLATE = `/manage`;
export const CREATE_GROUP_SKILL_TEMPLATE = `/group`;
export const GROUP_SKILL_TEMPLATE = CREATE_GROUP_SKILL_TEMPLATE;
export const RECAP_SKILL_TEMPLATE = `/recap`;
export const HANDOFF_SKILL_TEMPLATE = `/handoff`;

export { MANAGE_COMPOSER_TEMPLATE, CREATE_GROUP_COMPOSER_TEXT, PLAY_SKILL_TEMPLATE, MEETING_SKILL_TEMPLATE };

export const CHAT_SKILLS: ChatSkillDef[] = [
  {
    id: "manage",
    slash: "manage",
    label: "/manage",
    description: "Schedule tasks into your calendar before a deadline (Pro)",
    icon: CalendarDays,
    template: MANAGE_SKILL_TEMPLATE,
    requiresPaidPlan: true,
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
    logo: CHAT_APP_LOGOS.spotify,
    template: PLAY_SKILL_TEMPLATE,
  },
  {
    id: "meeting",
    slash: "meeting",
    label: "/meeting",
    description: "Schedule a meeting with @people and add it to your calendar",
    icon: Video,
    template: MEETING_SKILL_TEMPLATE,
  },
  {
    id: "calendar",
    slash: "calendar",
    label: "/calendar",
    description: "Include today's Google Calendar events in your prompt",
    logo: CHAT_APP_LOGOS.calendar,
    template: "/calendar ",
  },
  {
    id: "gmail",
    slash: "gmail",
    label: "/gmail",
    description: "Include recent Gmail messages in your prompt",
    logo: CHAT_APP_LOGOS.gmail,
    template: "/gmail ",
  },
  {
    id: "outlook",
    slash: "outlook",
    label: "/outlook",
    description: "Include recent Outlook mail in your prompt",
    logo: CHAT_APP_LOGOS.outlook,
    template: "/outlook ",
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

/** Connecteurs masqués du menu `/` — toujours utilisables en tapant le slash à la main. */
const SLASH_MENU_HIDDEN_CONNECTOR_IDS = new Set(["calendar", "gmail", "outlook"]);

export function filterChatSkillsForSlashMenu(query: string): ChatSkillDef[] {
  return filterChatSkills(query).filter((skill) => !SLASH_MENU_HIDDEN_CONNECTOR_IDS.has(skill.id));
}

export function isManageSchedulePrompt(text: string): boolean {
  return /(?:^|\s)\/manage\b/i.test(text.trim());
}

export { isNaturalLanguageManageRequest } from "./manageSchedulePrompt";

export { isPlaySkillPrompt } from "./playSkill";
