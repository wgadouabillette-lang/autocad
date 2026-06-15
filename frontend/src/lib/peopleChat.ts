export type PeopleChatSection = "friends" | "colleagues";

export interface Person {
  id: string;
  name: string;
  handle: string;
}

export interface PeopleMessage {
  id: string;
  author: string;
  text: string;
  at: number;
  mine?: boolean;
}

export interface PeopleThread {
  id: string;
  personId: string;
  personName: string;
  section: PeopleChatSection;
  workspaceId?: string;
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
