import type { Person } from "./peopleChat";

export const CREATE_GROUP_COMPOSER_TEXT = "@";

export interface CreateGroupSkillDraft {
  selectedMemberIds: string[];
  query: string;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function memberIdsFromComposerText(text: string, members: Person[]): string[] {
  const ids: string[] = [];
  for (const member of members) {
    const re = new RegExp(`@${escapeRegex(member.handle)}(?=\\s|$)`, "i");
    if (re.test(text)) ids.push(member.id);
  }
  return ids;
}

export function isCreateGroupComposerReady(text: string, members: Person[]): boolean {
  return memberIdsFromComposerText(text, members).length >= 1;
}

export function createDefaultCreateGroupDraft(): CreateGroupSkillDraft {
  return {
    selectedMemberIds: [],
    query: "",
  };
}

export function isCreateGroupDraftReady(draft: CreateGroupSkillDraft): boolean {
  return draft.selectedMemberIds.length >= 1;
}

export function filterCreateGroupMentionMenu(
  query: string,
  members: Person[],
  selectedIds: string[],
): Person[] {
  const q = query.trim().toLowerCase();
  return members
    .filter((member) => !selectedIds.includes(member.id))
    .filter(
      (member) =>
        !q ||
        member.name.toLowerCase().includes(q) ||
        member.handle.toLowerCase().includes(q) ||
        member.id.toLowerCase().includes(q),
    )
    .slice(0, 8);
}

export function buildGroupNameFromMembers(members: Person[]): string {
  const names = members.map((member) => member.name.trim()).filter(Boolean);
  if (names.length === 0) return "Groupe";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
