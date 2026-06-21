export type PeopleChatSection = "friends" | "colleagues" | "groups";

export interface Person {
  id: string;
  name: string;
  handle: string;
}

export interface PeopleManageScheduleEvent {
  title: string;
  detail?: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

export interface PeopleMessage {
  id: string;
  author: string;
  authorUid?: string;
  text: string;
  at: number;
  mine?: boolean;
  kind?: "text" | "handoff" | "manage" | "meeting";
  handoffId?: string;
  handoffTitle?: string;
  handoffPreview?: string;
  manageDisplayText?: string;
  manageEvents?: PeopleManageScheduleEvent[];
  manageSummary?: string;
  meetingTitle?: string;
  meetingDateKey?: string;
  meetingStartTime?: string;
  meetingEndTime?: string;
  meetingOrganizerName?: string;
}

export interface PeopleThread {
  id: string;
  personId: string;
  personName: string;
  section: PeopleChatSection;
  workspaceId?: string;
  groupName?: string;
  memberIds?: string[];
  memberNames?: Record<string, string>;
  creatorUid?: string;
  preview: string;
  updatedAt: number;
  unread: number;
  messages: PeopleMessage[];
}

export interface FriendRequest {
  id: string;
  from: Person;
  status: "pending" | "accepted" | "declined";
  outgoing?: boolean;
}

export function createThreadForPerson(
  person: Person,
  section: PeopleChatSection,
  workspaceId?: string,
): PeopleThread {
  const id =
    section === "friends"
      ? `friend-${person.id}`
      : `colleague-${workspaceId}-${person.id}`;
  return {
    id,
    personId: person.id,
    personName: person.name,
    section,
    workspaceId,
    preview: "",
    updatedAt: 0,
    unread: 0,
    messages: [],
  };
}

function sortMessagePanelThreads(threads: PeopleThread[]): PeopleThread[] {
  return [...threads].sort((a, b) => {
    const aActive = a.messages.length > 0 || a.unread > 0 ? 1 : 0;
    const bActive = b.messages.length > 0 || b.unread > 0 ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    if (aActive && bActive && b.updatedAt !== a.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return a.personName.localeCompare(b.personName, "fr");
  });
}

/** Liste complète Messages : amis (tous workspaces) + collègues du workspace actif. */
export function buildMessagePanelThreads(opts: {
  workspaceId: string;
  friends: Person[];
  friendThreads: PeopleThread[];
  colleagueThreads: PeopleThread[];
  workspaceMembers: Person[];
  localUserId?: string | null;
}): PeopleThread[] {
  const { workspaceId, friends, friendThreads, colleagueThreads, workspaceMembers, localUserId } =
    opts;
  const friendIds = new Set(friends.map((friend) => friend.id));
  const entries: PeopleThread[] = [];

  for (const friend of friends) {
    const existing = friendThreads.find((thread) => thread.personId === friend.id);
    entries.push(existing ?? createThreadForPerson(friend, "friends"));
  }

  for (const member of workspaceMembers) {
    if (!member.id || member.id === "local") continue;
    if (localUserId && member.id === localUserId) continue;
    if (friendIds.has(member.id)) continue;

    const existing = colleagueThreads.find((thread) => thread.personId === member.id);
    entries.push(existing ?? createThreadForPerson(member, "colleagues", workspaceId));
  }

  return sortMessagePanelThreads(entries);
}

export function resolvePersonPhotoURL(
  personId: string,
  membersByWorkspace: Record<string, Record<string, { photoURL?: string }>>,
  options?: { preferredWorkspaceId?: string; photoCache?: Record<string, string> },
): string | undefined {
  const cached = options?.photoCache?.[personId]?.trim();
  if (cached) return cached;

  const preferredWorkspaceId = options?.preferredWorkspaceId;
  if (preferredWorkspaceId) {
    const preferredPhoto = membersByWorkspace[preferredWorkspaceId]?.[personId]?.photoURL?.trim();
    if (preferredPhoto) return preferredPhoto;
  }
  for (const members of Object.values(membersByWorkspace)) {
    const photoURL = members[personId]?.photoURL?.trim();
    if (photoURL) return photoURL;
  }
  return undefined;
}

export function threadIdForGroup(groupId: string): string {
  return `group-${groupId}`;
}

export function groupIdFromThreadId(threadId: string): string | null {
  if (!threadId.startsWith("group-")) return null;
  return threadId.slice("group-".length);
}

export function createGroupThread(
  groupId: string,
  name: string,
  memberIds: string[],
  memberNames: Record<string, string>,
  creatorUid?: string,
): PeopleThread {
  const trimmedName = name.trim() || "Groupe";
  return {
    id: threadIdForGroup(groupId),
    personId: groupId,
    personName: trimmedName,
    section: "groups",
    groupName: trimmedName,
    memberIds: [...memberIds],
    memberNames: { ...memberNames },
    creatorUid,
    preview: "",
    updatedAt: Date.now(),
    unread: 0,
    messages: [],
  };
}

export function isCloudCapablePersonId(personId: string): boolean {
  if (!personId) return false;
  if (personId === "local") return false;
  if (personId.startsWith("email:")) return false;
  return true;
}

/** Members the creator may add: friends + colleagues from any shared workspace (deduped). */
export function collectAllWorkspaceMembers(
  membersByWorkspace: Record<string, Record<string, { displayName: string }>>,
): Person[] {
  const seen = new Set<string>();
  const entries: Person[] = [];

  for (const members of Object.values(membersByWorkspace)) {
    for (const [id, entry] of Object.entries(members)) {
      if (seen.has(id)) continue;
      seen.add(id);
      entries.push({
        id,
        name: entry.displayName.trim() || "Membre",
        handle: id,
      });
    }
  }

  return entries;
}

/** Members the creator may add: friends + workspace colleagues (deduped). */
export function buildEligibleGroupChatMembers(opts: {
  friends: Person[];
  workspaceMembers: Person[];
  localUserId?: string | null;
}): Person[] {
  const { friends, workspaceMembers, localUserId } = opts;
  const seen = new Set<string>();
  const entries: Person[] = [];

  const push = (person: Person) => {
    if (!isCloudCapablePersonId(person.id)) return;
    if (localUserId && person.id === localUserId) return;
    if (seen.has(person.id)) return;
    seen.add(person.id);
    entries.push(person);
  };

  for (const friend of friends) push(friend);
  for (const member of workspaceMembers) push(member);

  return entries.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function canAddPersonToGroupChat(
  personId: string,
  opts: {
    friends: Person[];
    workspaceMembers: Person[];
    localUserId?: string | null;
  },
): boolean {
  return buildEligibleGroupChatMembers(opts).some((person) => person.id === personId);
}
