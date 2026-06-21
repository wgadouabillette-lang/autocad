import type { Person, PeopleThread } from "./peopleChat";
import {
  buildManageSkillPayload,
  type ManageSchedulePromptDraft,
} from "./manageSchedulePrompt";
import { runManageScheduleSkill } from "./manageScheduleSkill";
import { serializePeopleManageEvents } from "./peopleManageSchedule";

export function seedMembersForPeopleThread(
  thread: PeopleThread,
  localUserId?: string | null,
): Person[] {
  if (thread.section === "groups") {
    const memberIds = thread.memberIds ?? [];
    const memberNames = thread.memberNames ?? {};
    return memberIds
      .filter((id) => id && id !== localUserId)
      .map((id) => ({
        id,
        name: memberNames[id]?.trim() || "Member",
        handle: id,
      }));
  }

  if (!thread.personId || thread.personId === localUserId) return [];
  return [
    {
      id: thread.personId,
      name: thread.personName,
      handle: thread.personId,
    },
  ];
}

export function isPeopleMemberPromptReady(
  selectedMemberIds: string[],
  requiredMemberIds: string[],
): boolean {
  if (selectedMemberIds.length === 0) return false;
  return requiredMemberIds.every((id) => selectedMemberIds.includes(id));
}

export function participantPeopleFromIds(
  memberIds: string[],
  eligibleMembers: Person[],
  seedMembers: Person[],
): Person[] {
  const byId = new Map<string, Person>();
  for (const person of [...eligibleMembers, ...seedMembers]) {
    byId.set(person.id, person);
  }
  return memberIds
    .map((id) => byId.get(id))
    .filter((person): person is Person => !!person);
}

export async function runPeopleManageScheduleSkill(draft: ManageSchedulePromptDraft): Promise<{
  displayText: string;
  summary: string;
  manageEvents: ReturnType<typeof serializePeopleManageEvents>;
} | null> {
  const payload = buildManageSkillPayload(draft);
  const result = await runManageScheduleSkill(payload.skillText, undefined, payload.managePrompt);
  // `applied` reste false jusqu'à confirmation utilisateur — on ne vérifie que les events proposés.
  if (result.events.length === 0) {
    return null;
  }

  return {
    displayText: payload.displayText,
    summary: result.summary,
    manageEvents: serializePeopleManageEvents(result.events),
  };
}
