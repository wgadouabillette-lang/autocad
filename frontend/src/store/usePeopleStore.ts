import { create } from "zustand";
import {
  createThreadForPerson,
  createGroupThread,
  createWorkspaceTextChannelThread,
  threadIdForGroup,
  threadIdForWorkspaceTextChannel,
  groupIdFromThreadId,
  workspaceTextChannelFromThreadId,
  buildEligibleGroupChatMembers,
  canAddPersonToGroupChat,
  collectAllWorkspaceMembers,
  isCloudCapablePersonId,
  type FriendRequest,
  type PeopleMessage,
  type PeopleThread,
  type Person,
} from "../lib/peopleChat";
import {
  createFriendRequest,
  findUserDirectoryByEmail,
  loadIncomingFriendRequests,
  loadUserDirectoryByUid,
  respondToFriendRequest,
  watchIncomingFriendRequests,
  watchOutgoingFriendRequests,
  type CloudFriendRequestDoc,
} from "../lib/firebase/userData";
import {
  ensureFriendChat,
  friendChatId,
  partnerUidFromChatId,
  sendFriendChatMessage,
  watchFriendChatMessages,
  watchFriendChats,
  type CloudFriendChat,
  type CloudFriendMessage,
} from "../lib/firebase/friendChats";
import {
  createGroupChatDoc,
  sendGroupChatMessage,
  watchGroupChatMessages,
  watchGroupChats,
  type CloudGroupChat,
} from "../lib/firebase/groupChats";
import {
  sendWorkspaceTextChannelMessage,
  watchWorkspaceTextChannelMessages,
  type WorkspaceTextChannelDoc,
} from "../lib/firebase/workspaceTextChannels";
import { deleteFriendChat, deleteGroupChat } from "../lib/firebase/deletePeopleChats";
import type { Unsubscribe } from "firebase/firestore";
import { auth } from "../lib/firebase/client";
import {
  clearLastReadAt,
  getFriendsTabSeenAt,
  getLastReadAt,
  setFriendsTabSeenAt,
  setLastReadAt,
} from "../lib/friendChatReadState";
import {
  dismissThreadId,
  getDismissedThreadIds,
} from "../lib/peopleChatDismissals";
import type { ManageSchedulePromptDraft } from "../lib/manageSchedulePrompt";
import { runPeopleManageScheduleSkill } from "../lib/peopleChatSkillActions";
import {
  peopleManageMessagePreview,
  syncPeopleManageEventsFromMessages,
} from "../lib/peopleManageSchedule";
import type { MeetingInvitePayload } from "../lib/meetingSkill";
import {
  meetingInviteMetaNotificationId,
  notifyInviteeOfMeetingInvite,
} from "../lib/meetingInviteNotifications";
import { useNotificationsStore } from "./useNotificationsStore";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";
import { useAuthStore } from "./useAuthStore";
import { useStore } from "./useStore";
import { useWorkspacePresenceStore } from "./useWorkspacePresenceStore";

function threadIdForFriend(personId: string) {
  return `friend-${personId}`;
}

function isCloudCapableFriend(personId: string): boolean {
  if (!personId) return false;
  if (personId.startsWith("email:")) return false;
  return true;
}

function firestoreUpdatedAtMillis(
  updatedAt?: { seconds: number; nanoseconds: number } | null,
): number {
  if (updatedAt && typeof updatedAt === "object" && "seconds" in updatedAt) {
    return updatedAt.seconds * 1000 + Math.floor(updatedAt.nanoseconds / 1_000_000);
  }
  return 0;
}

function previewFromDocMeta(meta: {
  lastMessageKind?: "text" | "handoff" | "manage" | "meeting";
  lastHandoffTitle?: string;
  lastPreview?: string;
}): string {
  if (meta.lastMessageKind === "handoff") {
    return meta.lastHandoffTitle?.trim() || meta.lastPreview?.trim() || "";
  }
  if (meta.lastMessageKind === "meeting") {
    return meta.lastPreview?.trim() || "Invitation à une réunion";
  }
  return meta.lastPreview?.trim() || "";
}

function mapCloudPeopleMessage(message: CloudFriendMessage, uid: string): PeopleMessage {
  return {
    id: message.id,
    author: message.authorName,
    authorUid: message.authorUid,
    text: message.text,
    at: cloudMessageTimestamp(message),
    mine: message.authorUid === uid,
    kind: message.kind,
    handoffId: message.handoffId,
    handoffTitle: message.handoffTitle,
    handoffPreview: message.handoffPreview,
    manageDisplayText: message.manageDisplayText,
    manageEvents: message.manageEvents,
    manageSummary: message.manageSummary,
    meetingTitle: message.meetingTitle,
    meetingDateKey: message.meetingDateKey,
    meetingStartTime: message.meetingStartTime,
    meetingEndTime: message.meetingEndTime,
    meetingOrganizerName: message.meetingOrganizerName,
  };
}

function previewForLastPeopleMessage(last?: PeopleMessage): string {
  if (!last) return "";
  return peopleManageMessagePreview(last);
}

function ensureColleagueThreadsForPartner(
  state: PeopleState,
  partner: Person,
  forceWorkspaceId?: string | null,
): Record<string, PeopleThread[]> {
  if (state.friends.some((friend) => friend.id === partner.id)) {
    return state.colleagueThreadsByWorkspace;
  }

  const presence = useWorkspacePresenceStore.getState().membersByWorkspace;
  let colleagueThreadsByWorkspace = state.colleagueThreadsByWorkspace;
  let changed = false;

  const ensureInWorkspace = (workspaceId: string) => {
    const existing = colleagueThreadsByWorkspace[workspaceId] ?? [];
    if (existing.some((thread) => thread.personId === partner.id)) return;
    if (!changed) {
      colleagueThreadsByWorkspace = { ...colleagueThreadsByWorkspace };
      changed = true;
    }
    colleagueThreadsByWorkspace[workspaceId] = [
      ...existing,
      createThreadForPerson(partner, "colleagues", workspaceId),
    ];
  };

  for (const [workspaceId, members] of Object.entries(presence)) {
    if (!members[partner.id]) continue;
    ensureInWorkspace(workspaceId);
  }

  if (forceWorkspaceId) {
    ensureInWorkspace(forceWorkspaceId);
  }

  return colleagueThreadsByWorkspace;
}

const inboxState = {
  uid: null as string | null,
  panelActive: false,
  friendMetadataUnsub: null as Unsubscribe | null,
  groupMetadataUnsub: null as Unsubscribe | null,
  threadMessageUnsub: null as Unsubscribe | null,
  activeThreadId: null as string | null,
  errorNotified: false,
};
const groupInboxState = {
  uid: null as string | null,
};
const seenMessageIdsByFriend = new Map<string, Set<string>>();
const pendingCloudMessages = new Map<
  string,
  { threadId: string; message: PeopleMessage }
>();

function mergeThreadMessages(
  existing: PeopleMessage[],
  incoming: PeopleMessage[],
): PeopleMessage[] {
  const incomingIds = new Set(incoming.map((message) => message.id));
  const pendingLocal = existing.filter(
    (message) =>
      message.mine &&
      message.id.startsWith("msg-") &&
      !incomingIds.has(message.id) &&
      !incoming.some(
        (cloudMessage) =>
          cloudMessage.mine &&
          cloudMessage.text === message.text &&
          Math.abs(cloudMessage.at - message.at) < 60_000,
      ),
  );
  const merged = [...incoming, ...pendingLocal];
  const seen = new Set<string>();
  return merged
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .sort((a, b) => a.at - b.at);
}

function mergeCloudMessagesWithPending(
  threadId: string,
  cloudMessages: PeopleMessage[],
): PeopleMessage[] {
  for (const [id, pending] of pendingCloudMessages.entries()) {
    if (pending.threadId !== threadId) continue;
    const confirmed = cloudMessages.some(
      (message) =>
        message.mine &&
        message.text === pending.message.text &&
        Math.abs(message.at - pending.message.at) < 60_000,
    );
    if (confirmed) pendingCloudMessages.delete(id);
  }

  const stillPending = [...pendingCloudMessages.values()]
    .filter((pending) => pending.threadId === threadId)
    .map((pending) => pending.message);

  if (stillPending.length === 0) return cloudMessages;

  const merged = [...cloudMessages, ...stillPending];
  const seen = new Set<string>();
  return merged
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .sort((a, b) => a.at - b.at);
}

function cloudMessageTimestamp(message: CloudFriendMessage): number {
  if (typeof message.clientCreatedAt === "number") return message.clientCreatedAt;
  return tsToMillis(message.createdAt);
}

function tsToMillis(value: CloudFriendMessage["createdAt"]): number {
  if (value && typeof value === "object" && "seconds" in value) {
    return value.seconds * 1000 + Math.floor(value.nanoseconds / 1_000_000);
  }
  return 0;
}

const EMPTY_PEOPLE_THREADS: PeopleThread[] = [];

interface PeopleState {
  friends: Person[];
  friendRequests: FriendRequest[];
  friendThreads: PeopleThread[];
  groupThreads: PeopleThread[];
  colleagueThreadsByWorkspace: Record<string, PeopleThread[]>;
  workspaceChannelThreadsByWorkspace: Record<string, PeopleThread[]>;
  activeFriendThreadId: string | null;
  personPhotoByUserId: Record<string, string>;
  friendsTabSeenAt: number;
  dismissedThreadIds: string[];

  friendThreadsList: () => PeopleThread[];
  colleagueThreadsForWorkspace: (workspaceId: string) => PeopleThread[];
  workspaceChannelThreadsForWorkspace: (workspaceId: string) => PeopleThread[];
  syncWorkspaceTextChannelsMetadata: (
    workspaceId: string,
    channels: WorkspaceTextChannelDoc[],
  ) => void;
  ensureWorkspaceTextChannelThread: (
    workspaceId: string,
    channelId: string,
    name: string,
  ) => string;
  removeWorkspaceTextChannelThread: (workspaceId: string, channelId: string) => void;
  clearWorkspaceResources: (workspaceId: string) => void;
  eligibleGroupChatMembers: (workspaceId: string) => Person[];
  unreadCount: (workspaceId: string) => number;
  peopleMessagesUnreadCount: () => number;
  threadById: (id: string) => PeopleThread | undefined;
  markFriendsTabSeen: () => void;

  hydrateFriendRequests: (uid: string | null, email: string | null) => () => void;
  subscribeFriendChats: (uid: string | null) => void;
  setFriendChatPanelActive: (active: boolean) => void;
  setActiveFriendThread: (threadId: string | null) => void;
  sendFriendRequest: (handle: string) => Promise<{ ok: boolean; error?: string }>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  declineFriendRequest: (requestId: string) => Promise<void>;
  sendMessage: (threadId: string, text: string) => void;
  sendManageScheduleMessage: (
    threadId: string,
    draft: ManageSchedulePromptDraft,
  ) => Promise<{ ok: boolean; error?: string }>;
  sendMeetingInviteMessage: (
    threadId: string,
    payload: MeetingInvitePayload,
  ) => Promise<{ ok: boolean; error?: string }>;
  markThreadRead: (threadId: string) => void;
  ensureColleagueThread: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => string;
  ensureFriendThread: (person: Person) => string;
  createGroupChat: (
    name: string,
    memberIds: string[],
  ) => Promise<{ ok: boolean; threadId?: string; error?: string }>;
  deletePeopleThread: (threadId: string) => Promise<{ ok: boolean; error?: string }>;
  openMessageFromNotification: (personId: string, personName: string) => void;
  openWorkspaceMemberConversation: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => void;
  cachePersonPhoto: (userId: string, photoURL?: string | null) => void;
  hydratePersonPhotos: (personIds: string[]) => Promise<void>;
}

function upsertFriend(state: PeopleState, person: Person): Person[] {
  if (state.friends.some((f) => f.id === person.id)) return state.friends;
  return [...state.friends, person];
}

function upsertFriendThread(state: PeopleState, person: Person): PeopleThread[] {
  const id = threadIdForFriend(person.id);
  if (state.friendThreads.some((t) => t.id === id)) return state.friendThreads;
  return [...state.friendThreads, createThreadForPerson(person, "friends")];
}

function personIdFromThreadId(threadId: string): string | null {
  if (threadId.startsWith("friend-")) return threadId.slice("friend-".length);
  const colleagueMatch = /^colleague-[^-]+-(.+)$/.exec(threadId);
  return colleagueMatch?.[1] ?? null;
}

function resolvePersonForThread(
  state: PeopleState,
  threadId: string,
  thread?: PeopleThread,
): Person | undefined {
  if (thread) {
    const known = state.friends.find((friend) => friend.id === thread.personId);
    if (known) return known;
    return {
      id: thread.personId,
      name: thread.personName,
      handle: thread.personId,
    };
  }

  const personId = personIdFromThreadId(threadId);
  if (!personId) return undefined;
  const known = state.friends.find((friend) => friend.id === personId);
  if (known) return known;
  return { id: personId, name: personId, handle: personId };
}

function resolveCloudFriendId(state: PeopleState, personId: string): string {
  const direct = state.friends.find((friend) => friend.id === personId);
  if (direct) return direct.id;
  const byThread = state.friends.find(
    (friend) => threadIdForFriend(friend.id) === threadIdForFriend(personId),
  );
  return byThread?.id ?? personId;
}

function applyMessagesToPersonThreads(
  state: PeopleState,
  personId: string,
  friendThreadId: string,
  messages: PeopleMessage[],
  preview: string,
  updatedAt: number,
  unreadDelta: number,
  isViewingThread: (threadId: string) => boolean,
): Pick<PeopleState, "friendThreads" | "colleagueThreadsByWorkspace"> {
  const patchThread = (thread: PeopleThread): PeopleThread => {
    const matchesPerson = thread.personId === personId;
    const matchesFriendThread = thread.id === friendThreadId;
    if (!matchesPerson && !matchesFriendThread) return thread;

    const viewing = isViewingThread(thread.id);
    return {
      ...thread,
      messages: mergeThreadMessages(thread.messages, messages),
      preview,
      updatedAt,
      unread: viewing ? 0 : thread.unread + unreadDelta,
    };
  };

  return {
    friendThreads: state.friendThreads.map(patchThread),
    colleagueThreadsByWorkspace: Object.fromEntries(
      Object.entries(state.colleagueThreadsByWorkspace).map(([workspaceId, threads]) => [
        workspaceId,
        threads.map(patchThread),
      ]),
    ),
  };
}

function personFromCloudRequest(request: CloudFriendRequestDoc): Person {
  return {
    id: request.fromUid,
    name: request.fromName || request.fromEmail.split("@")[0],
    handle: request.fromEmail,
  };
}

function workspaceIdForPartner(partnerId: string): string | null {
  const presence = useWorkspacePresenceStore.getState().membersByWorkspace;
  for (const [workspaceId, members] of Object.entries(presence)) {
    if (members[partnerId]) return workspaceId;
  }
  const activeRoomId = useStore.getState().activeRoomId;
  return activeRoomId || null;
}

function resolvePartnerPerson(
  state: PeopleState,
  partnerId: string,
  cloudMessages: CloudFriendMessage[],
): Person {
  const knownFriend = state.friends.find((friend) => friend.id === partnerId);
  if (knownFriend) return knownFriend;

  for (const threads of Object.values(state.colleagueThreadsByWorkspace)) {
    const thread = threads.find((entry) => entry.personId === partnerId);
    if (thread) {
      return {
        id: thread.personId,
        name: thread.personName,
        handle: thread.personId,
      };
    }
  }

  for (const members of Object.values(useWorkspacePresenceStore.getState().membersByWorkspace)) {
    const entry = members[partnerId];
    if (entry) {
      return {
        id: partnerId,
        name: entry.displayName.trim() || "Membre",
        handle: partnerId,
      };
    }
  }

  const remoteMessage = [...cloudMessages].reverse().find((message) => message.authorUid === partnerId);
  return {
    id: partnerId,
    name: remoteMessage?.authorName?.trim() || "Membre",
    handle: partnerId,
  };
}

function notificationIdForFriendRequest(requestId: string): string {
  return `friend-request-${requestId}`;
}

function persistThreadRead(state: PeopleState, threadId: string): void {
  const thread = state.friendThreads.find((t) => t.id === threadId)
    ?? state.groupThreads.find((t) => t.id === threadId)
    ?? Object.values(state.colleagueThreadsByWorkspace)
      .flat()
      .find((t) => t.id === threadId);
  if (!thread) return;
  const localUid = auth.currentUser?.uid;
  if (!localUid) return;
  const last = thread.messages[thread.messages.length - 1];
  const ts = last?.at ?? Date.now();
  setLastReadAt(localUid, thread.personId, ts);
}

function peopleMessagesUnreadTotal(state: PeopleState): number {
  const byPerson = new Map<string, number>();

  const track = (thread: PeopleThread) => {
    if (thread.unread <= 0) return;
    const prev = byPerson.get(thread.personId) ?? 0;
    byPerson.set(thread.personId, Math.max(prev, thread.unread));
  };

  for (const thread of state.friendThreads) track(thread);
  for (const thread of state.groupThreads) track(thread);
  for (const threads of Object.values(state.workspaceChannelThreadsByWorkspace)) {
    for (const thread of threads) track(thread);
  }
  for (const threads of Object.values(state.colleagueThreadsByWorkspace)) {
    for (const thread of threads) track(thread);
  }

  return [...byPerson.values()].reduce((sum, count) => sum + count, 0);
}

function clearGroupSubscriptions() {
  groupInboxState.uid = null;
}

function releaseThreadMessageSubscription() {
  inboxState.threadMessageUnsub?.();
  inboxState.threadMessageUnsub = null;
  inboxState.activeThreadId = null;
}

function clearInboxMetadataSubscriptions() {
  inboxState.friendMetadataUnsub?.();
  inboxState.friendMetadataUnsub = null;
  inboxState.groupMetadataUnsub?.();
  inboxState.groupMetadataUnsub = null;
  releaseThreadMessageSubscription();
}

function syncFriendChatsMetadata(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  uid: string,
  chats: CloudFriendChat[],
) {
  set((state) => {
    const activeThreadId = state.activeFriendThreadId;
    let friendThreads = state.friendThreads;
    let colleagueThreadsByWorkspace = state.colleagueThreadsByWorkspace;

    for (const chat of chats) {
      const partnerId = partnerUidFromChatId(chat.id, uid);
      if (!partnerId) continue;

      const threadId = threadIdForFriend(partnerId);
      const updatedAt = firestoreUpdatedAtMillis(chat.updatedAt) || Date.now();
      const preview = previewFromDocMeta(chat);
      const lastReadAt = getLastReadAt(uid, partnerId);
      const isUnread =
        !!chat.lastMessageAuthorUid &&
        chat.lastMessageAuthorUid !== uid &&
        updatedAt > lastReadAt;
      const isViewingPerson =
        activeThreadId != null &&
        state.threadById(activeThreadId)?.personId === partnerId;
      const keepMessages =
        inboxState.activeThreadId === threadId && inboxState.threadMessageUnsub != null;

      if (
        chat.lastMessageKind === "meeting" &&
        isUnread &&
        chat.lastMessageAuthorUid &&
        chat.lastMessageAuthorUid !== uid
      ) {
        const partnerForNotify = resolvePartnerPerson(state, partnerId, []);
        notifyInviteeOfMeetingInvite({
          metaId: meetingInviteMetaNotificationId(
            chat.id,
            updatedAt,
            preview || chat.lastPreview || "Réunion",
          ),
          organizerName: partnerForNotify.name,
          title: preview || chat.lastPreview || "Réunion",
          dateKey: "",
          startTime: "",
          endTime: "",
          threadId,
          personId: partnerId,
        });
      }

      const partner = resolvePartnerPerson(state, partnerId, []);
      colleagueThreadsByWorkspace = ensureColleagueThreadsForPartner(
        { ...state, friendThreads, colleagueThreadsByWorkspace },
        partner,
        useStore.getState().activeRoomId,
      );

      const isFriend = state.friends.some((friend) => friend.id === partnerId);
      if (isFriend && !friendThreads.some((thread) => thread.id === threadId)) {
        friendThreads = [
          ...friendThreads,
          {
            id: threadId,
            personId: partner.id,
            personName: partner.name,
            section: "friends" as const,
            preview: "",
            updatedAt,
            unread: 0,
            messages: [],
          },
        ];
      }

      const patchThread = (thread: PeopleThread): PeopleThread => {
        if (thread.personId !== partnerId && thread.id !== threadId) return thread;
        return {
          ...thread,
          personName: partner.name,
          preview: preview || thread.preview,
          updatedAt,
          unread: isViewingPerson ? 0 : isUnread ? Math.max(thread.unread, 1) : thread.unread,
          messages: keepMessages ? thread.messages : [],
        };
      };

      friendThreads = friendThreads.map(patchThread);
      colleagueThreadsByWorkspace = Object.fromEntries(
        Object.entries(colleagueThreadsByWorkspace).map(([workspaceId, threads]) => [
          workspaceId,
          threads.map(patchThread),
        ]),
      );
    }

    return { friendThreads, colleagueThreadsByWorkspace };
  });
}

function syncGroupChatsMetadata(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  uid: string,
  groups: CloudGroupChat[],
) {
  set((state) => {
    const activeThreadId = state.activeFriendThreadId;
    const groupThreads = groups.map((group) => {
      const threadId = threadIdForGroup(group.id);
      const updatedAt = firestoreUpdatedAtMillis(group.updatedAt) || Date.now();
      const preview = previewFromDocMeta(group);
      const lastReadAt = getLastReadAt(uid, group.id);
      const isUnread =
        !!group.lastMessageAuthorUid &&
        group.lastMessageAuthorUid !== uid &&
        updatedAt > lastReadAt;
      const isViewing = activeThreadId === threadId;
      const keepMessages =
        inboxState.activeThreadId === threadId && inboxState.threadMessageUnsub != null;
      const existing = state.groupThreads.find((thread) => thread.id === threadId);

      const base = existing
        ? {
            ...existing,
            personName: group.name,
            groupName: group.name,
            memberIds: group.participants,
            memberNames: { ...existing.memberNames, ...group.memberNames },
            creatorUid: group.creatorUid || existing.creatorUid,
          }
        : createGroupThread(
            group.id,
            group.name,
            group.participants,
            group.memberNames ?? {},
            group.creatorUid,
          );

      return {
        ...base,
        preview: preview || base.preview,
        updatedAt,
        unread: isViewing ? 0 : isUnread ? Math.max(base.unread, 1) : base.unread,
        messages: keepMessages ? base.messages : [],
      };
    });

    return { groupThreads };
  });
}

type PeopleStoreApi = {
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void;
  get: () => PeopleState;
};

function syncWorkspaceTextChannelMessages(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  uid: string,
  workspaceId: string,
  channel: WorkspaceTextChannelDoc,
  cloudMessages: CloudFriendMessage[],
) {
  const threadId = threadIdForWorkspaceTextChannel(workspaceId, channel.id);
  const mappedMessages = cloudMessages.map((m) => mapCloudPeopleMessage(m, uid));
  syncPeopleManageEventsFromMessages(mappedMessages);

  const last = mappedMessages[mappedMessages.length - 1];
  const preview = previewForLastPeopleMessage(last);
  const updatedAt = last?.at ?? firestoreUpdatedAtMillis(channel.updatedAt as { seconds: number; nanoseconds: number } | null) ?? Date.now();
  const viewing = get().activeFriendThreadId === threadId;
  const existing =
    get().workspaceChannelThreadsByWorkspace[workspaceId]?.find((thread) => thread.id === threadId);
  const newIncoming = cloudMessages.filter((m) => m.authorUid !== uid).length;
  const unreadDelta = viewing ? 0 : Math.max(0, newIncoming - (existing?.messages.length ?? 0));

  set((state) => {
    const current = state.workspaceChannelThreadsByWorkspace[workspaceId] ?? [];
    const found = current.find((thread) => thread.id === threadId);
    const thread = found
      ? {
          ...found,
          personName: channel.name?.trim() || found.personName,
          messages: mappedMessages,
          preview: preview || channel.lastPreview?.trim() || found.preview,
          updatedAt,
          unread: viewing ? 0 : found.unread + unreadDelta,
        }
      : {
          ...createWorkspaceTextChannelThread(
            workspaceId,
            channel.id,
            channel.name?.trim() || "general",
          ),
          messages: mappedMessages,
          preview: preview || channel.lastPreview?.trim() || "",
          updatedAt,
          unread: viewing ? 0 : unreadDelta,
        };

    const workspaceChannelThreadsByWorkspace = {
      ...state.workspaceChannelThreadsByWorkspace,
      [workspaceId]: found
        ? current.map((item) => (item.id === threadId ? thread : item))
        : [...current, thread],
    };

    return { workspaceChannelThreadsByWorkspace };
  });
}

function syncWorkspaceTextChannelsMetadata(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  workspaceId: string,
  channels: WorkspaceTextChannelDoc[],
) {
  set((state) => {
    const current = state.workspaceChannelThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS;
    const byId = new Map(current.map((thread) => [thread.personId, thread]));
    const nextThreads = channels.map((channel) => {
      const threadId = threadIdForWorkspaceTextChannel(workspaceId, channel.id);
      const existing = byId.get(channel.id);
      const updatedAt =
        firestoreUpdatedAtMillis(channel.updatedAt as { seconds: number; nanoseconds: number } | null) ||
        existing?.updatedAt ||
        0;
      const preview = channel.lastPreview?.trim() || existing?.preview || "";
      const isViewing = state.activeFriendThreadId === threadId;
      const base = existing
        ? {
            ...existing,
            personName: channel.name?.trim() || existing.personName,
            preview,
            updatedAt,
          }
        : createWorkspaceTextChannelThread(
            workspaceId,
            channel.id,
            channel.name?.trim() || "general",
          );
      return {
        ...base,
        preview,
        updatedAt,
        unread: isViewing ? 0 : base.unread,
        messages: existing?.messages ?? [],
      };
    });

    if (
      current.length === nextThreads.length &&
      current.every((thread, index) => {
        const next = nextThreads[index];
        return (
          thread.id === next.id &&
          thread.personName === next.personName &&
          thread.preview === next.preview &&
          thread.updatedAt === next.updatedAt &&
          thread.unread === next.unread &&
          thread.messages === next.messages
        );
      })
    ) {
      return state;
    }

    return {
      workspaceChannelThreadsByWorkspace: {
        ...state.workspaceChannelThreadsByWorkspace,
        [workspaceId]: nextThreads,
      },
    };
  });
}

function ensureThreadMessageSubscription(store: PeopleStoreApi, threadId: string) {
  const uid = inboxState.uid;
  if (!uid || !inboxState.panelActive) return;

  if (inboxState.activeThreadId === threadId && inboxState.threadMessageUnsub) return;

  releaseThreadMessageSubscription();
  inboxState.activeThreadId = threadId;

  const groupId = groupIdFromThreadId(threadId);
  if (groupId) {
    inboxState.threadMessageUnsub = watchGroupChatMessages(
      groupId,
      (messages) => {
        const group = store.get().groupThreads.find((thread) => thread.id === threadId);
        if (!group) return;
        syncGroupChatMessages(
          store.set,
          store.get,
          uid,
          {
            id: groupId,
            name: group.groupName ?? group.personName,
            participants: group.memberIds ?? [],
            creatorUid: group.creatorUid ?? "",
            memberNames: group.memberNames,
          },
          messages,
        );
      },
      (error) => {
        console.error(`Group chat ${groupId} unavailable`, error);
      },
    );
    return;
  }

  const workspaceChannel = workspaceTextChannelFromThreadId(threadId);
  if (workspaceChannel) {
    inboxState.threadMessageUnsub = watchWorkspaceTextChannelMessages(
      workspaceChannel.workspaceId,
      workspaceChannel.channelId,
      (messages) => {
        const thread =
          store
            .get()
            .workspaceChannelThreadsByWorkspace[workspaceChannel.workspaceId]?.find(
              (item) => item.id === threadId,
            );
        syncWorkspaceTextChannelMessages(
          store.set,
          store.get,
          uid,
          workspaceChannel.workspaceId,
          {
            id: workspaceChannel.channelId,
            workspaceId: workspaceChannel.workspaceId,
            name: thread?.personName ?? "general",
          },
          messages,
        );
      },
      (error) => {
        console.error(
          `Workspace text channel ${workspaceChannel.workspaceId}/${workspaceChannel.channelId} unavailable`,
          error,
        );
      },
    );
    return;
  }

  const personId = personIdFromThreadId(threadId);
  if (!personId) return;

  const chatId = friendChatId(uid, personId);
  void ensureFriendChat(uid, personId)
    .catch(() => {})
    .finally(() => {
      if (inboxState.activeThreadId !== threadId || !inboxState.panelActive) return;
      inboxState.threadMessageUnsub = watchFriendChatMessages(
        chatId,
        (cloudMessages) => {
          syncInboxChat(store.set, store.get, uid, chatId, cloudMessages);
        },
        (error) => {
          console.error(`Friend chat ${chatId} unavailable`, error);
        },
      );
    });
}

function startInboxMetadataSubscriptions(store: PeopleStoreApi, uid: string) {
  if (inboxState.friendMetadataUnsub || inboxState.groupMetadataUnsub) return;

  inboxState.friendMetadataUnsub = watchFriendChats(
    uid,
    (chats) => {
      syncFriendChatsMetadata(store.set, store.get, uid, chats);
    },
    (error) => {
      const code = (error as { code?: string })?.code;
      if (code === "permission-denied") {
        console.warn(
          "Friend chats: permissions Firestore manquantes. Déployez les règles : firebase deploy --only firestore:rules",
        );
        return;
      }
      console.error("Friend chats unavailable", error);
    },
  );

  inboxState.groupMetadataUnsub = watchGroupChats(
    uid,
    (groups) => {
      syncGroupChatsMetadata(store.set, store.get, uid, groups);
    },
    (error) => {
      const code = (error as { code?: string })?.code;
      if (code === "permission-denied") {
        console.warn(
          "Group chats: permissions Firestore manquantes. Déployez les règles : firebase deploy --only firestore:rules",
        );
        return;
      }
      console.error("Group chats unavailable", error);
    },
  );

  groupInboxState.uid = uid;
}

function workspaceMembersForGroupPicker(): Person[] {
  return collectAllWorkspaceMembers(useWorkspacePresenceStore.getState().membersByWorkspace);
}

function syncGroupChatMessages(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  uid: string,
  group: CloudGroupChat,
  cloudMessages: CloudFriendMessage[],
) {
  const threadId = threadIdForGroup(group.id);
  const mappedMessages = cloudMessages.map((m) => mapCloudPeopleMessage(m, uid));
  syncPeopleManageEventsFromMessages(mappedMessages);

  const last = mappedMessages[mappedMessages.length - 1];
  const preview = previewForLastPeopleMessage(last);
  const updatedAt = last?.at ?? Date.now();
  const viewing = get().activeFriendThreadId === threadId;
  const newIncoming = cloudMessages.filter((m) => m.authorUid !== uid).length;

  set((state) => {
    const existing = state.groupThreads.find((thread) => thread.id === threadId);
    const unreadDelta = viewing ? 0 : Math.max(0, newIncoming - (existing?.messages.length ?? 0));
    const thread = existing
      ? {
          ...existing,
          personName: group.name,
          groupName: group.name,
          memberIds: group.participants,
          memberNames: {
            ...existing.memberNames,
            ...group.memberNames,
          },
          creatorUid: group.creatorUid || existing.creatorUid,
          messages: mappedMessages,
          preview,
          updatedAt,
          unread: viewing ? 0 : existing.unread + unreadDelta,
        }
      : createGroupThread(
          group.id,
          group.name,
          group.participants,
          group.memberNames ?? {},
          group.creatorUid,
        );

    const patched = {
      ...thread,
      messages: mappedMessages,
      preview,
      updatedAt,
      unread: viewing ? 0 : thread.unread,
    };

    const groupThreads = existing
      ? state.groupThreads.map((item) => (item.id === threadId ? patched : item))
      : [...state.groupThreads, patched];

    return { groupThreads };
  });
}

function syncInboxChat(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  uid: string,
  chatId: string,
  cloudMessages: CloudFriendMessage[],
) {
  const partnerId = partnerUidFromChatId(chatId, uid);
  if (!partnerId) return;

  const threadId = threadIdForFriend(partnerId);
  const mappedMessages = mergeCloudMessagesWithPending(
    threadId,
    cloudMessages.map((m) => mapCloudPeopleMessage(m, uid)),
  );
  syncPeopleManageEventsFromMessages(mappedMessages);

  const friendSeen = seenMessageIdsByFriend.get(partnerId) ?? new Set<string>();
  const isInitialLoad = friendSeen.size === 0;
  const newIncomingMessages = cloudMessages.filter(
    (m) => !friendSeen.has(m.id) && m.authorUid !== uid,
  );
  for (const m of cloudMessages) friendSeen.add(m.id);
  seenMessageIdsByFriend.set(partnerId, friendSeen);

  for (const m of newIncomingMessages) {
    if (m.kind === "meeting" && m.authorUid !== uid) {
      notifyInviteeOfMeetingInvite({
        messageId: m.id,
        organizerName: m.meetingOrganizerName ?? m.authorName,
        title: m.meetingTitle ?? "Réunion",
        dateKey: m.meetingDateKey ?? "",
        startTime: m.meetingStartTime ?? "",
        endTime: m.meetingEndTime ?? "",
        threadId,
        personId: partnerId,
      });
    }
  }

  const lastReadAt = isInitialLoad ? getLastReadAt(uid, partnerId) : 0;
  const persistedUnreadCount = isInitialLoad
    ? cloudMessages.filter(
        (m) => m.authorUid !== uid && cloudMessageTimestamp(m) > lastReadAt,
      ).length
    : 0;

  const viewingPartnerNow =
    get().activeFriendThreadId != null &&
    get().threadById(get().activeFriendThreadId!)?.personId === partnerId;
  if (viewingPartnerNow) {
    const latest = cloudMessages[cloudMessages.length - 1];
    const latestTs = latest ? cloudMessageTimestamp(latest) : 0;
    if (latestTs > 0) setLastReadAt(uid, partnerId, latestTs);
  }

  set((state) => {
    const partner = resolvePartnerPerson(state, partnerId, cloudMessages);
    const isViewingPerson =
      state.activeFriendThreadId != null &&
      state.threadById(state.activeFriendThreadId)?.personId === partnerId;
    const unreadDelta = isViewingPerson
      ? 0
      : isInitialLoad
      ? persistedUnreadCount
      : newIncomingMessages.length;
    const last = mappedMessages[mappedMessages.length - 1];
    const preview = previewForLastPeopleMessage(last);
    const updatedAt = last?.at ?? Date.now();
    const isViewingThread = (activeThreadId: string) =>
      state.activeFriendThreadId === activeThreadId || isViewingPerson;

    const colleagueThreadsByWorkspace = ensureColleagueThreadsForPartner(
      state,
      partner,
      useStore.getState().activeRoomId,
    );
    const isFriend = state.friends.some((friend) => friend.id === partnerId);
    let threads = state.friendThreads;
    if (isFriend && !threads.some((t) => t.id === threadId)) {
      threads = [
        ...threads,
        {
          id: threadId,
          personId: partner.id,
          personName: partner.name,
          section: "friends" as const,
          preview: "",
          updatedAt,
          unread: 0,
          messages: [],
        },
      ];
    } else if (!isFriend && !threads.some((t) => t.personId === partnerId)) {
      threads = [
        ...threads,
        {
          id: threadId,
          personId: partner.id,
          personName: partner.name,
          section: "friends" as const,
          preview: "",
          updatedAt,
          unread: 0,
          messages: [],
        },
      ];
    }

    return applyMessagesToPersonThreads(
      { ...state, friendThreads: threads, colleagueThreadsByWorkspace },
      partnerId,
      threadId,
      mappedMessages,
      preview,
      updatedAt,
      unreadDelta,
      isViewingThread,
    );
  });
}

function stopInboxSubscriptions() {
  clearInboxMetadataSubscriptions();
  clearGroupSubscriptions();
  seenMessageIdsByFriend.clear();
}

function syncFriendRequestNotifications(requests: FriendRequest[]) {
  const pendingIncoming = requests.filter((request) => request.status === "pending" && !request.outgoing);
  useNotificationsStore.getState().syncFriendRequests(
    pendingIncoming.map((request) => ({
      id: notificationIdForFriendRequest(request.id),
      friendRequestId: request.id,
      title: "Demande d'ami",
      body: `${request.from.name} veut vous ajouter en ami.`,
      createdAt: Date.now(),
    })),
  );
}

function applyIncomingFriendRequests(
  currentRequests: FriendRequest[],
  cloudRequests: CloudFriendRequestDoc[],
): FriendRequest[] {
  const outgoing = currentRequests.filter((request) => request.outgoing);
  const incoming = cloudRequests.map((request): FriendRequest => ({
    id: request.id,
    from: personFromCloudRequest(request),
    status: request.status,
  }));
  return [...outgoing, ...incoming];
}

function personFromOutgoingRequest(request: CloudFriendRequestDoc): Person {
  const fallbackId = request.toUid ?? `email:${request.toEmail}`;
  return {
    id: fallbackId,
    name: request.toEmail.split("@")[0],
    handle: request.toEmail,
  };
}

function friendRequestErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("permission") || message.includes("insufficient")) {
      return "Firebase refuse la demande. Déployez les règles Firestore puis réessayez.";
    }
    return error.message;
  }
  return "Impossible d'envoyer la demande d'ami.";
}

interface FriendTarget {
  toEmail: string;
  toUid: string | null;
  person: Person;
}

function isLikelyEmail(value: string): boolean {
  return /.+@.+\..+/.test(value);
}

async function resolveFriendTarget(input: string): Promise<FriendTarget | undefined> {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;

  if (isLikelyEmail(normalized)) {
    const directoryUser = await findUserDirectoryByEmail(normalized).catch(() => null);
    if (directoryUser) {
      return {
        toEmail: directoryUser.email,
        toUid: directoryUser.uid,
        person: {
          id: directoryUser.uid,
          name: directoryUser.displayName || directoryUser.email.split("@")[0],
          handle: directoryUser.email,
        },
      };
    }
    return {
      toEmail: normalized,
      toUid: null,
      person: {
        id: `email:${normalized}`,
        name: normalized.split("@")[0],
        handle: normalized,
      },
    };
  }

  return undefined;
}

export const usePeopleStore = create<PeopleState>((set, get) => ({
  friends: [],
  friendRequests: [],
  friendThreads: [],
  groupThreads: [],
  colleagueThreadsByWorkspace: {},
  workspaceChannelThreadsByWorkspace: {},
  activeFriendThreadId: null,
  personPhotoByUserId: {},
  friendsTabSeenAt: 0,
  dismissedThreadIds: [],

  friendThreadsList: () => get().friendThreads,

  markFriendsTabSeen: () => {
    const ts = Date.now();
    const uid = auth.currentUser?.uid;
    if (uid) setFriendsTabSeenAt(uid, ts);
    set({ friendsTabSeenAt: ts });
  },

  colleagueThreadsForWorkspace: (workspaceId) =>
    get().colleagueThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS,

  workspaceChannelThreadsForWorkspace: (workspaceId) =>
    get().workspaceChannelThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS,

  syncWorkspaceTextChannelsMetadata: (workspaceId, channels) => {
    syncWorkspaceTextChannelsMetadata(set, get, workspaceId, channels);
  },

  ensureWorkspaceTextChannelThread: (workspaceId, channelId, name) => {
    const threadId = threadIdForWorkspaceTextChannel(workspaceId, channelId);
    const current = get().workspaceChannelThreadsByWorkspace[workspaceId] ?? [];
    if (current.some((thread) => thread.id === threadId)) {
      return threadId;
    }
    const thread = createWorkspaceTextChannelThread(workspaceId, channelId, name);
    set((state) => ({
      workspaceChannelThreadsByWorkspace: {
        ...state.workspaceChannelThreadsByWorkspace,
        [workspaceId]: [...current, thread],
      },
    }));
    return threadId;
  },

  removeWorkspaceTextChannelThread: (workspaceId, channelId) => {
    const threadId = threadIdForWorkspaceTextChannel(workspaceId, channelId);
    const state = get();
    if (state.activeFriendThreadId === threadId) {
      get().setActiveFriendThread(null);
    }
    set((current) => ({
      workspaceChannelThreadsByWorkspace: {
        ...current.workspaceChannelThreadsByWorkspace,
        [workspaceId]: (current.workspaceChannelThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS).filter(
          (thread) => thread.id !== threadId,
        ),
      },
    }));
  },

  clearWorkspaceResources: (workspaceId) => {
    const normalized = workspaceId.trim().toLowerCase();
    if (!normalized) return;

    const activeThreadId = inboxState.activeThreadId ?? get().activeFriendThreadId;
    if (activeThreadId) {
      const channelRef = workspaceTextChannelFromThreadId(activeThreadId);
      const colleagueThread = get().colleagueThreadsByWorkspace[normalized]?.find(
        (thread) => thread.id === activeThreadId,
      );
      if (channelRef?.workspaceId === normalized || colleagueThread) {
        releaseThreadMessageSubscription();
        get().setActiveFriendThread(null);
      }
    }

    set((state) => {
      const colleagueThreadsByWorkspace = { ...state.colleagueThreadsByWorkspace };
      const workspaceChannelThreadsByWorkspace = { ...state.workspaceChannelThreadsByWorkspace };
      delete colleagueThreadsByWorkspace[normalized];
      delete workspaceChannelThreadsByWorkspace[normalized];
      return { colleagueThreadsByWorkspace, workspaceChannelThreadsByWorkspace };
    });
  },

  eligibleGroupChatMembers: (workspaceId) =>
    buildEligibleGroupChatMembers({
      friends: get().friends,
      workspaceMembers: workspaceMembersForGroupPicker(),
      localUserId: auth.currentUser?.uid,
    }),

  unreadCount: (workspaceId) => {
    const friends = get().friendThreads.reduce((s, t) => s + t.unread, 0);
    const groups = get().groupThreads.reduce((s, t) => s + t.unread, 0);
    const colleagues = (
      get().colleagueThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS
    ).reduce((s, t) => s + t.unread, 0);
    const workspaceChannels = (
      get().workspaceChannelThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS
    ).reduce((s, t) => s + t.unread, 0);
    return friends + groups + colleagues + workspaceChannels;
  },

  peopleMessagesUnreadCount: () => peopleMessagesUnreadTotal(get()),

  threadById: (id) => {
    const group = get().groupThreads.find((t) => t.id === id);
    if (group) return group;
    const friend = get().friendThreads.find((t) => t.id === id);
    if (friend) return friend;
    for (const threads of Object.values(get().workspaceChannelThreadsByWorkspace)) {
      const found = threads.find((t) => t.id === id);
      if (found) return found;
    }
    for (const threads of Object.values(get().colleagueThreadsByWorkspace)) {
      const found = threads.find((t) => t.id === id);
      if (found) return found;
    }
    return undefined;
  },

  hydrateFriendRequests: (uid, email) => {
    if (!uid || !email) {
      set({ friendRequests: get().friendRequests.filter((request) => request.outgoing) });
      syncFriendRequestNotifications(get().friendRequests);
      return () => {};
    }
    void loadIncomingFriendRequests(email)
      .then((cloudRequests) => {
        const nextRequests = applyIncomingFriendRequests(get().friendRequests, cloudRequests);
        set({ friendRequests: nextRequests });
        syncFriendRequestNotifications(nextRequests);
      })
      .catch((error) => {
        useNotificationsStore.getState().push({
          kind: "friend_request",
          title: "Demandes d'amis indisponibles",
          body: friendRequestErrorMessage(error),
        });
      });

    const unsubscribeIncoming = watchIncomingFriendRequests(
      email,
      (cloudRequests) => {
        const nextRequests = applyIncomingFriendRequests(get().friendRequests, cloudRequests);
        set({ friendRequests: nextRequests });
        syncFriendRequestNotifications(nextRequests);
      },
      (error) => {
        useNotificationsStore.getState().push({
          kind: "friend_request",
          title: "Demandes d'amis indisponibles",
          body: friendRequestErrorMessage(error),
        });
      },
    );

    const unsubscribeOutgoing = watchOutgoingFriendRequests(
      uid,
      (cloudRequests) => {
        const state = get();
        const updatedOutgoing: FriendRequest[] = cloudRequests.map((request) => ({
          id: request.id,
          from: personFromOutgoingRequest(request),
          status: request.status,
          outgoing: true,
        }));
        const incoming = state.friendRequests.filter((r) => !r.outgoing);
        let friends = state.friends;
        let friendThreads = state.friendThreads;
        for (const request of cloudRequests) {
          if (request.status === "accepted") {
            const person = personFromOutgoingRequest(request);
            friends = friends.some((f) => f.id === person.id || f.handle === person.handle)
              ? friends
              : [...friends, person];
            const threadId = threadIdForFriend(person.id);
            friendThreads = friendThreads.some((t) => t.id === threadId)
              ? friendThreads
              : [...friendThreads, createThreadForPerson(person, "friends")];
          }
        }
        const nextRequests = [...updatedOutgoing, ...incoming];
        set({ friendRequests: nextRequests, friends, friendThreads });
        syncFriendRequestNotifications(nextRequests);
      },
      () => {
        // Ignore: la confidentialité des demandes sortantes n'est pas critique.
      },
    );

    return () => {
      unsubscribeIncoming();
      unsubscribeOutgoing();
    };
  },

  sendFriendRequest: async (handle) => {
    const target = await resolveFriendTarget(handle);
    if (!target) {
      return { ok: false, error: "Adresse email invalide." };
    }
    const state = get();
    const currentUser = auth.currentUser;
    if (!currentUser?.uid || !currentUser.email) {
      return { ok: false, error: "Connectez-vous pour envoyer une demande d'ami." };
    }
    const myEmail = currentUser.email.trim().toLowerCase();
    if (target.toEmail === myEmail || target.toUid === currentUser.uid) {
      return { ok: false, error: "Vous ne pouvez pas vous ajouter vous-même." };
    }
    if (state.friends.some((f) => f.id === target.person.id)) {
      return { ok: false, error: "Cette personne est déjà dans vos amis." };
    }
    if (
      state.friendRequests.some(
        (r) => r.status === "pending" && r.from.id === target.person.id,
      )
    ) {
      return { ok: false, error: "Une demande est déjà en attente." };
    }
    const outgoing: FriendRequest = {
      id: `req-out-${Date.now()}`,
      from: target.person,
      status: "pending",
      outgoing: true,
    };
    try {
      await createFriendRequest({
        fromUid: currentUser.uid,
        fromEmail: currentUser.email,
        fromName: useStore.getState().userDisplayName,
        toEmail: target.toEmail,
        toUid: target.toUid,
      });
    } catch (error) {
      return { ok: false, error: friendRequestErrorMessage(error) };
    }
    set({ friendRequests: [...state.friendRequests, outgoing] });
    return { ok: true };
  },

  acceptFriendRequest: async (requestId) => {
    const state = get();
    const request = state.friendRequests.find((r) => r.id === requestId);
    if (!request || request.status !== "pending" || request.outgoing) return;
    const responderUid = auth.currentUser?.uid;
    if (!responderUid) return;
    try {
      await respondToFriendRequest(requestId, "accepted", responderUid);
    } catch (error) {
      useNotificationsStore.getState().push({
        kind: "friend_request",
        title: "Réponse impossible",
        body: friendRequestErrorMessage(error),
      });
      return;
    }

    const nextRequests = state.friendRequests.filter((r) => r.id !== requestId);
    set({
      friends: upsertFriend(state, request.from),
      friendThreads: upsertFriendThread(state, request.from),
      friendRequests: nextRequests,
    });
    syncFriendRequestNotifications(nextRequests);
  },

  declineFriendRequest: async (requestId) => {
    const responderUid = auth.currentUser?.uid;
    if (!responderUid) return;
    try {
      await respondToFriendRequest(requestId, "declined", responderUid);
    } catch (error) {
      useNotificationsStore.getState().push({
        kind: "friend_request",
        title: "Réponse impossible",
        body: friendRequestErrorMessage(error),
      });
      return;
    }
    const nextRequests = get().friendRequests.filter((r) => r.id !== requestId);
    set({ friendRequests: nextRequests });
    syncFriendRequestNotifications(nextRequests);
  },

  sendMessage: (threadId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const currentUser = auth.currentUser;
    const myUid = currentUser?.uid;
    const myName = useStore.getState().userDisplayName || "Vous";
    const state = get();
    const thread = state.threadById(threadId);

    if (thread?.section === "groups") {
      const groupId = groupIdFromThreadId(threadId);
      if (!myUid || !groupId || !thread.memberIds?.includes(myUid)) {
        useNotificationsStore.getState().push({
          kind: "message",
          title: "Message non envoyé",
          body: "Connectez-vous pour envoyer un message de groupe.",
        });
        return;
      }

      const optimisticId = `msg-${Date.now()}`;
      const msg: PeopleMessage = {
        id: optimisticId,
        author: "Vous",
        authorUid: myUid,
        text: trimmed,
        at: Date.now(),
        mine: true,
      };

      const patchGroup = (t: PeopleThread) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, msg],
              preview: trimmed,
              updatedAt: Date.now(),
              unread: 0,
            }
          : t;

      const rollbackGroup = (t: PeopleThread) => {
        if (t.id !== threadId) return t;
        const messages = t.messages.filter((m) => m.id !== optimisticId);
        const last = messages[messages.length - 1];
        return {
          ...t,
          messages,
          preview: last?.text ?? "",
          updatedAt: last?.at ?? t.updatedAt,
        };
      };

      set({ groupThreads: get().groupThreads.map(patchGroup) });

      void sendGroupChatMessage(
        groupId,
        myUid,
        myName,
        thread.memberIds,
        trimmed,
      ).catch((error) => {
        set({ groupThreads: get().groupThreads.map(rollbackGroup) });
        useNotificationsStore.getState().push({
          kind: "message",
          title: "Message non envoyé",
          body: error instanceof Error ? error.message : "Erreur d'envoi.",
        });
      });
      return;
    }

    if (thread?.section === "workspace-channels") {
      const channelRef = workspaceTextChannelFromThreadId(threadId);
      if (!myUid || !channelRef) {
        useNotificationsStore.getState().push({
          kind: "message",
          title: "Message non envoyé",
          body: "Connectez-vous pour envoyer un message dans ce salon.",
        });
        return;
      }

      const optimisticId = `msg-${Date.now()}`;
      const msg: PeopleMessage = {
        id: optimisticId,
        author: "Vous",
        authorUid: myUid,
        text: trimmed,
        at: Date.now(),
        mine: true,
      };

      const patchWorkspaceChannel = (t: PeopleThread) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, msg],
              preview: trimmed,
              updatedAt: Date.now(),
              unread: 0,
            }
          : t;

      const rollbackWorkspaceChannel = (t: PeopleThread) => {
        if (t.id !== threadId) return t;
        const messages = t.messages.filter((m) => m.id !== optimisticId);
        const last = messages[messages.length - 1];
        return {
          ...t,
          messages,
          preview: last?.text ?? "",
          updatedAt: last?.at ?? t.updatedAt,
        };
      };

      set((state) => ({
        workspaceChannelThreadsByWorkspace: Object.fromEntries(
          Object.entries(state.workspaceChannelThreadsByWorkspace).map(([workspaceId, threads]) => [
            workspaceId,
            threads.map(patchWorkspaceChannel),
          ]),
        ),
      }));

      void sendWorkspaceTextChannelMessage(
        channelRef.workspaceId,
        channelRef.channelId,
        myUid,
        myName,
        trimmed,
      ).catch((error) => {
        set((state) => ({
          workspaceChannelThreadsByWorkspace: Object.fromEntries(
            Object.entries(state.workspaceChannelThreadsByWorkspace).map(([workspaceId, threads]) => [
              workspaceId,
              threads.map(rollbackWorkspaceChannel),
            ]),
          ),
        }));
        useNotificationsStore.getState().push({
          kind: "message",
          title: "Message non envoyé",
          body: error instanceof Error ? error.message : "Erreur d'envoi.",
        });
      });
      return;
    }

    const person = resolvePersonForThread(state, threadId, thread);
    const rawPersonId = person?.id ?? thread?.personId ?? personIdFromThreadId(threadId);
    const cloudPersonId = rawPersonId ? resolveCloudFriendId(state, rawPersonId) : null;
    const isCloudFriend = Boolean(myUid && cloudPersonId && isCloudCapableFriend(cloudPersonId));

    if (!isCloudFriend) {
      useNotificationsStore.getState().push({
        kind: "message",
        title: "Message non envoyé",
        body: myUid
          ? "Ce contact ne peut pas recevoir de messages cloud pour le moment."
          : "Connectez-vous pour envoyer des messages à d'autres utilisateurs.",
      });
      return;
    }

    const optimisticId = `msg-${Date.now()}`;
    const msg: PeopleMessage = {
      id: optimisticId,
      author: "Vous",
      text: trimmed,
      at: Date.now(),
      mine: true,
    };

    const patchThread = (t: PeopleThread): PeopleThread => {
      const matchesThread =
        t.id === threadId || (cloudPersonId != null && t.personId === cloudPersonId);
      if (!matchesThread) return t;
      return {
        ...t,
        messages: [...t.messages, msg],
        preview: trimmed,
        updatedAt: Date.now(),
        unread: 0,
      };
    };

    const rollbackThread = (t: PeopleThread): PeopleThread => {
      const matchesThread =
        t.id === threadId || (cloudPersonId != null && t.personId === cloudPersonId);
      if (!matchesThread) return t;
      const messages = t.messages.filter((m) => m.id !== optimisticId);
      const last = messages[messages.length - 1];
      return {
        ...t,
        messages,
        preview: last?.text ?? "",
        updatedAt: last?.at ?? t.updatedAt,
      };
    };

    if (isCloudFriend) {
      pendingCloudMessages.set(optimisticId, {
        threadId: threadIdForFriend(cloudPersonId!),
        message: msg,
      });
    }

    set((current) => {
      let friendThreads = current.friendThreads;
      if (isCloudFriend && person) {
        const cloudPerson = current.friends.find((friend) => friend.id === cloudPersonId) ?? {
          ...person,
          id: cloudPersonId!,
        };
        friendThreads = upsertFriendThread({ ...current, friendThreads }, cloudPerson);
      }
      return {
        friendThreads: friendThreads.map(patchThread),
        colleagueThreadsByWorkspace: Object.fromEntries(
          Object.entries(current.colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map(patchThread),
          ]),
        ),
      };
    });

    if (isCloudFriend && cloudPersonId) {
      const chatId = friendChatId(myUid!, cloudPersonId);
      void ensureFriendChat(myUid!, cloudPersonId)
        .then(() =>
          sendFriendChatMessage(
            chatId,
            myUid!,
            myName,
            [myUid!, cloudPersonId],
            trimmed,
          ),
        )
        .catch((error) => {
          pendingCloudMessages.delete(optimisticId);
          set({
            friendThreads: get().friendThreads.map(rollbackThread),
            colleagueThreadsByWorkspace: Object.fromEntries(
              Object.entries(get().colleagueThreadsByWorkspace).map(([ws, threads]) => [
                ws,
                threads.map(rollbackThread),
              ]),
            ),
          });
          useNotificationsStore.getState().push({
            kind: "friend_request",
            title: "Message non envoyé",
            body: error instanceof Error ? error.message : "Erreur d'envoi.",
          });
        });
    }
  },

  sendManageScheduleMessage: async (threadId, draft) => {
    const currentUser = auth.currentUser;
    const myUid = currentUser?.uid;
    const myName = useStore.getState().userDisplayName || "Vous";
    const state = get();
    const thread = state.threadById(threadId);
    if (!thread) return { ok: false, error: "Conversation introuvable." };

    let scheduled;
    try {
      scheduled = await runPeopleManageScheduleSkill(draft);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Impossible de planifier les tâches.",
      };
    }

    if (!scheduled) {
      return {
        ok: false,
        error: "Impossible de planifier les tâches. Vérifiez la deadline et les créneaux disponibles.",
      };
    }

    const extras = {
      kind: "manage" as const,
      manageDisplayText: scheduled.displayText,
      manageEvents: scheduled.manageEvents,
      manageSummary: scheduled.summary.split("\n")[0] ?? "",
    };
    const trimmed = scheduled.displayText;

    if (thread.section === "groups") {
      const groupId = groupIdFromThreadId(threadId);
      if (!myUid || !groupId || !thread.memberIds?.includes(myUid)) {
        return {
          ok: false,
          error: "Connectez-vous pour planifier dans ce groupe.",
        };
      }

      const optimisticId = `msg-${Date.now()}`;
      const msg: PeopleMessage = {
        id: optimisticId,
        author: "Vous",
        text: trimmed,
        at: Date.now(),
        mine: true,
        kind: "manage",
        manageDisplayText: scheduled.displayText,
        manageEvents: scheduled.manageEvents,
        manageSummary: extras.manageSummary,
      };

      const patchGroup = (t: PeopleThread) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, msg],
              preview: trimmed,
              updatedAt: Date.now(),
              unread: 0,
            }
          : t;

      const rollbackGroup = (t: PeopleThread) => {
        if (t.id !== threadId) return t;
        const messages = t.messages.filter((m) => m.id !== optimisticId);
        const last = messages[messages.length - 1];
        return {
          ...t,
          messages,
          preview: previewForLastPeopleMessage(last),
          updatedAt: last?.at ?? t.updatedAt,
        };
      };

      set({ groupThreads: get().groupThreads.map(patchGroup) });

      try {
        await sendGroupChatMessage(
          groupId,
          myUid,
          myName,
          thread.memberIds,
          trimmed,
          extras,
        );
        return { ok: true };
      } catch (error) {
        set({ groupThreads: get().groupThreads.map(rollbackGroup) });
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Erreur d'envoi.",
        };
      }
    }

    const person = resolvePersonForThread(state, threadId, thread);
    const rawPersonId = person?.id ?? thread.personId ?? personIdFromThreadId(threadId);
    const cloudPersonId = rawPersonId ? resolveCloudFriendId(state, rawPersonId) : null;
    const isCloudFriend = Boolean(myUid && cloudPersonId && isCloudCapableFriend(cloudPersonId));

    if (!isCloudFriend) {
      return {
        ok: false,
        error: myUid
          ? "Ce contact ne peut pas recevoir ce planning pour le moment."
          : "Connectez-vous pour planifier avec d'autres utilisateurs.",
      };
    }

    const optimisticId = `msg-${Date.now()}`;
    const msg: PeopleMessage = {
      id: optimisticId,
      author: "Vous",
      text: trimmed,
      at: Date.now(),
      mine: true,
      kind: "manage",
      manageDisplayText: scheduled.displayText,
      manageEvents: scheduled.manageEvents,
      manageSummary: extras.manageSummary,
    };

    const patchThread = (t: PeopleThread): PeopleThread => {
      const matchesThread =
        t.id === threadId || (cloudPersonId != null && t.personId === cloudPersonId);
      if (!matchesThread) return t;
      return {
        ...t,
        messages: [...t.messages, msg],
        preview: trimmed,
        updatedAt: Date.now(),
        unread: 0,
      };
    };

    const rollbackThread = (t: PeopleThread): PeopleThread => {
      const matchesThread =
        t.id === threadId || (cloudPersonId != null && t.personId === cloudPersonId);
      if (!matchesThread) return t;
      const messages = t.messages.filter((m) => m.id !== optimisticId);
      const last = messages[messages.length - 1];
      return {
        ...t,
        messages,
        preview: previewForLastPeopleMessage(last),
        updatedAt: last?.at ?? t.updatedAt,
      };
    };

    pendingCloudMessages.set(optimisticId, {
      threadId: threadIdForFriend(cloudPersonId!),
      message: msg,
    });

    set((current) => {
      let friendThreads = current.friendThreads;
      if (person) {
        const cloudPerson = current.friends.find((friend) => friend.id === cloudPersonId) ?? {
          ...person,
          id: cloudPersonId!,
        };
        friendThreads = upsertFriendThread({ ...current, friendThreads }, cloudPerson);
      }
      return {
        friendThreads: friendThreads.map(patchThread),
        colleagueThreadsByWorkspace: Object.fromEntries(
          Object.entries(current.colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map(patchThread),
          ]),
        ),
      };
    });

    try {
      const chatId = friendChatId(myUid!, cloudPersonId!);
      await ensureFriendChat(myUid!, cloudPersonId!);
      await sendFriendChatMessage(
        chatId,
        myUid!,
        myName,
        [myUid!, cloudPersonId!],
        trimmed,
        extras,
      );
      return { ok: true };
    } catch (error) {
      pendingCloudMessages.delete(optimisticId);
      set({
        friendThreads: get().friendThreads.map(rollbackThread),
        colleagueThreadsByWorkspace: Object.fromEntries(
          Object.entries(get().colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map(rollbackThread),
          ]),
        ),
      });
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Erreur d'envoi.",
      };
    }
  },

  sendMeetingInviteMessage: async (threadId, payload) => {
    const currentUser = auth.currentUser;
    const myUid = currentUser?.uid;
    const myName = payload.organizerName.trim() || useStore.getState().userDisplayName || "Vous";
    const state = get();
    const thread = state.threadById(threadId);
    if (!thread) return { ok: false, error: "Conversation introuvable." };

    const trimmed = payload.invitationText.trim();
    if (!trimmed) return { ok: false, error: "Invitation vide." };

    const extras = {
      kind: "meeting" as const,
      meetingTitle: payload.title,
      meetingDateKey: payload.dateKey,
      meetingStartTime: payload.startTime,
      meetingEndTime: payload.endTime,
      meetingOrganizerName: myName,
    };

    const person = resolvePersonForThread(state, threadId, thread);
    const rawPersonId = person?.id ?? thread.personId ?? personIdFromThreadId(threadId);
    const cloudPersonId = rawPersonId ? resolveCloudFriendId(state, rawPersonId) : null;
    const isCloudFriend = Boolean(myUid && cloudPersonId && isCloudCapableFriend(cloudPersonId));

    if (!isCloudFriend) {
      return {
        ok: false,
        error: myUid
          ? "Ce contact ne peut pas recevoir d'invitation pour le moment."
          : "Connectez-vous pour inviter d'autres utilisateurs.",
      };
    }

    const optimisticId = `msg-${Date.now()}`;
    const msg: PeopleMessage = {
      id: optimisticId,
      author: "Vous",
      text: trimmed,
      at: Date.now(),
      mine: true,
      kind: "meeting",
      meetingTitle: payload.title,
      meetingDateKey: payload.dateKey,
      meetingStartTime: payload.startTime,
      meetingEndTime: payload.endTime,
      meetingOrganizerName: myName,
    };

    const patchThread = (t: PeopleThread): PeopleThread => {
      const matchesThread =
        t.id === threadId || (cloudPersonId != null && t.personId === cloudPersonId);
      if (!matchesThread) return t;
      return {
        ...t,
        messages: [...t.messages, msg],
        preview: trimmed,
        updatedAt: Date.now(),
        unread: 0,
      };
    };

    const rollbackThread = (t: PeopleThread): PeopleThread => {
      const matchesThread =
        t.id === threadId || (cloudPersonId != null && t.personId === cloudPersonId);
      if (!matchesThread) return t;
      const messages = t.messages.filter((m) => m.id !== optimisticId);
      const last = messages[messages.length - 1];
      return {
        ...t,
        messages,
        preview: previewForLastPeopleMessage(last),
        updatedAt: last?.at ?? t.updatedAt,
      };
    };

    pendingCloudMessages.set(optimisticId, {
      threadId: threadIdForFriend(cloudPersonId!),
      message: msg,
    });

    set((current) => {
      let friendThreads = current.friendThreads;
      if (person) {
        const cloudPerson = current.friends.find((friend) => friend.id === cloudPersonId) ?? {
          ...person,
          id: cloudPersonId!,
        };
        friendThreads = upsertFriendThread({ ...current, friendThreads }, cloudPerson);
      }
      return {
        friendThreads: friendThreads.map(patchThread),
        colleagueThreadsByWorkspace: Object.fromEntries(
          Object.entries(current.colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map(patchThread),
          ]),
        ),
      };
    });

    try {
      const chatId = friendChatId(myUid!, cloudPersonId!);
      await ensureFriendChat(myUid!, cloudPersonId!);
      await sendFriendChatMessage(
        chatId,
        myUid!,
        myName,
        [myUid!, cloudPersonId!],
        trimmed,
        extras,
      );
      return { ok: true };
    } catch (error) {
      pendingCloudMessages.delete(optimisticId);
      set({
        friendThreads: get().friendThreads.map(rollbackThread),
        colleagueThreadsByWorkspace: Object.fromEntries(
          Object.entries(get().colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map(rollbackThread),
          ]),
        ),
      });
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Erreur d'envoi.",
      };
    }
  },

  subscribeFriendChats: (uid) => {
    if (!uid) {
      inboxState.panelActive = false;
      stopInboxSubscriptions();
      inboxState.uid = null;
      inboxState.errorNotified = false;
      pendingCloudMessages.clear();
      set({ friendsTabSeenAt: 0, groupThreads: [], dismissedThreadIds: [] });
      return;
    }

    set({
      friendsTabSeenAt: getFriendsTabSeenAt(uid),
      dismissedThreadIds: getDismissedThreadIds(uid),
    });
    inboxState.uid = uid;
  },

  setFriendChatPanelActive: (active) => {
    const uid = inboxState.uid;
    if (!uid) return;

    if (active) {
      if (inboxState.panelActive) return;
      inboxState.panelActive = true;
      startInboxMetadataSubscriptions({ set, get }, uid);
      const activeThreadId = get().activeFriendThreadId;
      if (activeThreadId) {
        ensureThreadMessageSubscription({ set, get }, activeThreadId);
      }
      return;
    }

    if (!inboxState.panelActive) return;
    inboxState.panelActive = false;
    clearInboxMetadataSubscriptions();
    set((state) => ({
      friendThreads: state.friendThreads.map((thread) => ({ ...thread, messages: [] })),
      groupThreads: state.groupThreads.map((thread) => ({ ...thread, messages: [] })),
      colleagueThreadsByWorkspace: Object.fromEntries(
        Object.entries(state.colleagueThreadsByWorkspace).map(([workspaceId, threads]) => [
          workspaceId,
          threads.map((thread) => ({ ...thread, messages: [] })),
        ]),
      ),
    }));
  },

  openWorkspaceMemberConversation: (workspaceId, personId, personName) => {
    const trimmedId = personId.trim();
    const trimmedName = personName.trim();
    if (!trimmedId || trimmedId === "local" || !trimmedName) return;

    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (firebaseUid && trimmedId === firebaseUid) return;

    closePanelsOnSide("left");
    closePanelsOnSide("right", "chat");
    get().setFriendChatPanelActive(true);

    const isFriend = get().friends.some((friend) => friend.id === trimmedId);
    const threadId = isFriend
      ? get().ensureFriendThread({
          id: trimmedId,
          name: trimmedName,
          handle: trimmedId,
        })
      : get().ensureColleagueThread(workspaceId, trimmedId, trimmedName);

    get().markThreadRead(threadId);
    get().setActiveFriendThread(threadId);
    useStore.getState().switchChatPanelMode("friends");
  },

  openMessageFromNotification: (personId, personName) => {
    const workspaceId =
      workspaceIdForPartner(personId) ?? useStore.getState().activeRoomId;
    get().openWorkspaceMemberConversation(workspaceId, personId, personName);
  },

  cachePersonPhoto: (userId, photoURL) => {
    const trimmed = photoURL?.trim();
    if (!userId || !trimmed) return;
    if (get().personPhotoByUserId[userId] === trimmed) return;
    set((state) => ({
      personPhotoByUserId: { ...state.personPhotoByUserId, [userId]: trimmed },
    }));
  },

  hydratePersonPhotos: async (personIds) => {
    const unique = [...new Set(personIds.filter((id) => id && id !== "local"))];
    const missing = unique.filter((id) => !get().personPhotoByUserId[id]);
    if (missing.length === 0) return;

    const updates: Record<string, string> = {};
    await Promise.all(
      missing.map(async (uid) => {
        const profile = await loadUserDirectoryByUid(uid).catch(() => null);
        const photoURL = profile?.photoURL?.trim();
        if (photoURL) updates[uid] = photoURL;
      }),
    );
    if (Object.keys(updates).length === 0) return;
    set((state) => ({
      personPhotoByUserId: { ...state.personPhotoByUserId, ...updates },
    }));
  },

  setActiveFriendThread: (threadId) => {
    const previousThreadId = get().activeFriendThreadId;
    set((state) => {
      if (state.activeFriendThreadId === threadId) return state;
      const next: Partial<PeopleState> = { activeFriendThreadId: threadId };
      if (threadId) {
        persistThreadRead(state, threadId);
        next.friendThreads = state.friendThreads.map((t) =>
          t.id === threadId ? { ...t, unread: 0 } : t,
        );
        next.colleagueThreadsByWorkspace = Object.fromEntries(
          Object.entries(state.colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
          ]),
        );
        next.groupThreads = state.groupThreads.map((t) =>
          t.id === threadId ? { ...t, unread: 0 } : t,
        );
        next.workspaceChannelThreadsByWorkspace = Object.fromEntries(
          Object.entries(state.workspaceChannelThreadsByWorkspace).map(([workspaceId, threads]) => [
            workspaceId,
            threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
          ]),
        );
      }
      return next as PeopleState;
    });

    if (previousThreadId && previousThreadId !== threadId) {
      releaseThreadMessageSubscription();
    }
    if (threadId && inboxState.panelActive) {
      ensureThreadMessageSubscription({ set, get }, threadId);
    } else if (!threadId) {
      releaseThreadMessageSubscription();
    }
  },

  markThreadRead: (threadId) => {
    persistThreadRead(get(), threadId);
    const patch = (t: PeopleThread) =>
      t.id === threadId ? { ...t, unread: 0 } : t;

    set({
      friendThreads: get().friendThreads.map(patch),
      groupThreads: get().groupThreads.map(patch),
      workspaceChannelThreadsByWorkspace: Object.fromEntries(
        Object.entries(get().workspaceChannelThreadsByWorkspace).map(([workspaceId, threads]) => [
          workspaceId,
          threads.map(patch),
        ]),
      ),
      colleagueThreadsByWorkspace: Object.fromEntries(
        Object.entries(get().colleagueThreadsByWorkspace).map(([ws, threads]) => [
          ws,
          threads.map(patch),
        ]),
      ),
    });
  },

  createGroupChat: async (name, memberIds) => {
    const trimmedName = name.trim();
    const myUid = auth.currentUser?.uid;
    if (!myUid) {
      return { ok: false, error: "Connectez-vous pour créer un groupe." };
    }
    if (!trimmedName) {
      return { ok: false, error: "Donnez un nom au groupe." };
    }

    const uniqueMemberIds = [...new Set(memberIds.filter((id) => id && id !== myUid))];
    if (uniqueMemberIds.length < 1) {
      return { ok: false, error: "Ajoutez au moins un membre au groupe." };
    }

    const eligibility = {
      friends: get().friends,
      workspaceMembers: workspaceMembersForGroupPicker(),
      localUserId: myUid,
    };
    const invalid = uniqueMemberIds.find(
      (memberId) => !canAddPersonToGroupChat(memberId, eligibility),
    );
    if (invalid) {
      return {
        ok: false,
        error: "Vous ne pouvez ajouter que des amis ou des collègues de workspace.",
      };
    }

    const memberNames: Record<string, string> = {
      [myUid]: useStore.getState().userDisplayName || "Vous",
    };
    for (const memberId of uniqueMemberIds) {
      const eligible = buildEligibleGroupChatMembers(eligibility).find(
        (person) => person.id === memberId,
      );
      if (eligible) memberNames[memberId] = eligible.name;
    }

    const participants = [myUid, ...uniqueMemberIds];
    const groupId = crypto.randomUUID();
    const thread = createGroupThread(groupId, trimmedName, participants, memberNames, myUid);

    try {
      await createGroupChatDoc({
        groupId,
        name: trimmedName,
        participants,
        creatorUid: myUid,
        memberNames,
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Impossible de créer le groupe.",
      };
    }

    set({
      groupThreads: [...get().groupThreads.filter((item) => item.id !== thread.id), thread],
      activeFriendThreadId: thread.id,
    });
    return { ok: true, threadId: thread.id };
  },

  deletePeopleThread: async (threadId) => {
    const myUid = auth.currentUser?.uid;
    const state = get();
    const thread = state.threadById(threadId);
    if (!thread) {
      return { ok: false, error: "Conversation introuvable." };
    }

    try {
      if (thread.section === "groups") {
        const groupId = groupIdFromThreadId(threadId);
        if (!groupId) return { ok: false, error: "Groupe introuvable." };
        if (!myUid) {
          return { ok: false, error: "Connectez-vous pour supprimer ce groupe." };
        }
        await deleteGroupChat(groupId);
        if (inboxState.activeThreadId === threadId) {
          releaseThreadMessageSubscription();
        }
      } else {
        const cloudPersonId =
          myUid && isCloudCapablePersonId(thread.personId)
            ? resolveCloudFriendId(state, thread.personId)
            : null;
        if (myUid && cloudPersonId && isCloudCapableFriend(cloudPersonId)) {
          await deleteFriendChat(friendChatId(myUid, cloudPersonId));
          seenMessageIdsByFriend.delete(cloudPersonId);
          if (inboxState.activeThreadId === threadId) {
            releaseThreadMessageSubscription();
          }
        }
        if (myUid) clearLastReadAt(myUid, thread.personId);
      }

      if (myUid) dismissThreadId(myUid, threadId);

      set((current) => {
        const dismissedThreadIds = [...new Set([...current.dismissedThreadIds, threadId])];
        const colleagueThreadsByWorkspace =
          thread.section === "colleagues" && thread.workspaceId
            ? {
                ...current.colleagueThreadsByWorkspace,
                [thread.workspaceId]: (
                  current.colleagueThreadsByWorkspace[thread.workspaceId] ?? []
                ).filter((item) => item.id !== threadId),
              }
            : current.colleagueThreadsByWorkspace;

        return {
          dismissedThreadIds,
          activeFriendThreadId:
            current.activeFriendThreadId === threadId ? null : current.activeFriendThreadId,
          friendThreads: current.friendThreads.filter((item) => item.id !== threadId),
          groupThreads: current.groupThreads.filter((item) => item.id !== threadId),
          colleagueThreadsByWorkspace,
        };
      });

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Impossible de supprimer la conversation.",
      };
    }
  },

  ensureColleagueThread: (workspaceId, personId, personName) => {
    const state = get();
    const existing = (state.colleagueThreadsByWorkspace[workspaceId] ?? []).find(
      (t) => t.personId === personId,
    );
    if (existing) return existing.id;

    const thread = createThreadForPerson(
      { id: personId, name: personName, handle: personId },
      "colleagues",
      workspaceId,
    );
    set({
      colleagueThreadsByWorkspace: {
        ...state.colleagueThreadsByWorkspace,
        [workspaceId]: [
          ...(state.colleagueThreadsByWorkspace[workspaceId] ?? []),
          thread,
        ],
      },
    });
    return thread.id;
  },

  ensureFriendThread: (person) => {
    const state = get();
    const existing = state.friendThreads.find((thread) => thread.personId === person.id);
    if (existing) return existing.id;

    set({
      friends: upsertFriend(state, person),
      friendThreads: upsertFriendThread(state, person),
    });
    return threadIdForFriend(person.id);
  },
}));
