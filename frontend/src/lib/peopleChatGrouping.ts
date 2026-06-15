import type { PeopleMessage } from "./peopleChat";

const GROUP_GAP_MS = 5 * 60 * 1000;

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

function sameGroup(a: PeopleMessage, b: PeopleMessage): boolean {
  if (Boolean(a.mine) !== Boolean(b.mine)) return false;
  if (messageAuthorKey(a) !== messageAuthorKey(b)) return false;
  return Math.abs(a.at - b.at) <= GROUP_GAP_MS;
}

export function buildPeopleChatTimeline(messages: PeopleMessage[]): PeopleChatTimelineEntry[] {
  if (messages.length === 0) return [];

  const timeline: PeopleChatTimelineEntry[] = [];
  let groupMessages: PeopleMessage[] = [];

  const flushGroup = () => {
    if (groupMessages.length === 0) return;
    const first = groupMessages[0]!;
    timeline.push({
      kind: "messages",
      key: `group-${first.id}`,
      mine: Boolean(first.mine),
      author: first.author,
      authorUid: messageAuthorKey(first),
      items: groupMessages.map((message, index) => ({
        message,
        isFirstInGroup: index === 0,
        isLastInGroup: index === groupMessages.length - 1,
      })),
    });
    groupMessages = [];
  };

  for (const message of messages) {
    const previous = groupMessages[groupMessages.length - 1];
    if (previous && !sameGroup(previous, message)) {
      flushGroup();
    }
    groupMessages.push(message);
  }

  flushGroup();
  return timeline;
}
