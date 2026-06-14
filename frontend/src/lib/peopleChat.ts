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
    updatedAt: Date.now(),
    unread: 0,
    messages: [],
  };
}
