import type { PeopleMessage } from "./peopleChat";

export interface PeopleChatRenderItem {
  message: PeopleMessage;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

export interface PeopleChatMessageBlock {
  kind: "messages";
  key: string;
  mine: boolean;
  author: string;
  authorUid: string;
  items: PeopleChatRenderItem[];
}

export type PeopleChatTimelineEntry = PeopleChatMessageBlock;

function messageAuthorKey(message: PeopleMessage): string {
  return message.authorUid ?? (message.mine ? "__mine__" : message.author);
}

function chronologicalMessages(messages: PeopleMessage[]): PeopleMessage[] {
  return [...messages].sort((a, b) => {
    const byTime = (a.at || 0) - (b.at || 0);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

export function isOwnPeopleMessage(
  message: PeopleMessage,
  localUserId: string | null | undefined,
): boolean {
  const uid = localUserId?.trim();
  const authorUid = message.authorUid?.trim();
  if (uid && authorUid) return authorUid === uid;
  return message.mine === true;
}

export function buildPeopleChatTimeline(
  messages: PeopleMessage[],
  localUserId?: string | null,
): PeopleChatTimelineEntry[] {
  if (messages.length === 0) return [];

  const isOwn = (message: PeopleMessage) => isOwnPeopleMessage(message, localUserId);
  return chronologicalMessages(messages).map((message) => ({
    kind: "messages" as const,
    key: `row-${message.id}`,
    mine: isOwn(message),
    author: message.author,
    authorUid: messageAuthorKey(message),
    items: [
      {
        message,
        isFirstInGroup: true,
        isLastInGroup: true,
      },
    ],
  }));
}
