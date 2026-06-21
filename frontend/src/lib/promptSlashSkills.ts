import { filterChatSkillsForSlashMenu, type ChatSkillDef } from "./chatSkills";
import { filterPeopleChatSkills } from "./peopleChatSkills";

export interface SlashQuery {
  start: number;
  query: string;
}

export function slashQueryAt(text: string, caret: number): SlashQuery | null {
  const before = text.slice(0, caret);
  const slash = before.lastIndexOf("/");
  if (slash === -1) return null;
  if (slash > 0 && !/\s/.test(before[slash - 1] ?? "")) return null;
  const query = before.slice(slash + 1);
  if (/\s/.test(query)) return null;
  return { start: slash, query };
}

export function filterSlashSkillMenu(query: string): ChatSkillDef[] {
  return filterChatSkillsForSlashMenu(query).slice(0, 8);
}

export function filterPeopleSlashSkillMenu(query: string): ChatSkillDef[] {
  return filterPeopleChatSkills(query).slice(0, 8);
}
