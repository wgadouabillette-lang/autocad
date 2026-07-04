import { friendChatId } from "./firebase/friendChats";
import {
  groupIdFromThreadId,
  isCloudCapablePersonId,
  workspaceTextChannelFromThreadId,
} from "./peopleChat";

export type ChatTypingScope =
  | { kind: "theater"; workspaceId: string }
  | { kind: "friend"; chatId: string }
  | { kind: "group"; groupId: string }
  | { kind: "workspace-channel"; workspaceId: string; channelId: string };

function personIdFromThreadId(threadId: string): string | null {
  if (threadId.startsWith("friend-")) return threadId.slice("friend-".length);
  const colleagueMatch = /^colleague-[^-]+-(.+)$/.exec(threadId);
  return colleagueMatch?.[1] ?? null;
}

export function resolveChatTypingScopeFromThread(
  threadId: string | null | undefined,
  firebaseUid: string | null | undefined,
): ChatTypingScope | null {
  if (!threadId || !firebaseUid) return null;

  const groupId = groupIdFromThreadId(threadId);
  if (groupId) return { kind: "group", groupId };

  const channel = workspaceTextChannelFromThreadId(threadId);
  if (channel) {
    return {
      kind: "workspace-channel",
      workspaceId: channel.workspaceId.trim().toLowerCase(),
      channelId: channel.channelId,
    };
  }

  const personId = personIdFromThreadId(threadId);
  if (personId && isCloudCapablePersonId(personId)) {
    return { kind: "friend", chatId: friendChatId(firebaseUid, personId) };
  }

  return null;
}

export function resolveTheaterChatTypingScope(workspaceId: string): ChatTypingScope {
  return { kind: "theater", workspaceId: workspaceId.trim().toLowerCase() };
}

export function chatTypingScopeKey(scope: ChatTypingScope | null): string {
  if (!scope) return "";
  switch (scope.kind) {
    case "theater":
      return `theater:${scope.workspaceId}`;
    case "friend":
      return `friend:${scope.chatId}`;
    case "group":
      return `group:${scope.groupId}`;
    case "workspace-channel":
      return `channel:${scope.workspaceId}:${scope.channelId}`;
  }
}
