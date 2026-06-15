import { create } from "zustand";
import {
  createThreadForPerson,
  type FriendRequest,
  type PeopleMessage,
  type PeopleThread,
  type Person,
} from "../lib/peopleChat";
import {
  createFriendRequest,
  findUserDirectoryByEmail,
  loadIncomingFriendRequests,
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
  watchInboxFriendMessages,
  watchFriendChatMessages,
  type CloudFriendMessage,
} from "../lib/firebase/friendChats";
import type { Unsubscribe } from "firebase/firestore";
import { auth } from "../lib/firebase/client";
import { useNotificationsStore } from "./useNotificationsStore";
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

function collectCloudChatPartners(state: PeopleState, uid: string): Person[] {
  const byId = new Map<string, Person>();

  for (const friend of state.friends) {
    if (friend.id !== uid && isCloudCapableFriend(friend.id)) {
      byId.set(friend.id, friend);
    }
  }

  for (const threads of Object.values(state.colleagueThreadsByWorkspace)) {
    for (const thread of threads) {
      if (
        thread.personId !== uid &&
        isCloudCapableFriend(thread.personId) &&
        !byId.has(thread.personId)
      ) {
        byId.set(thread.personId, {
          id: thread.personId,
          name: thread.personName,
          handle: thread.personId,
        });
      }
    }
  }

  for (const members of Object.values(useWorkspacePresenceStore.getState().membersByWorkspace)) {
    for (const [memberUid, entry] of Object.entries(members)) {
      if (memberUid === uid || !isCloudCapableFriend(memberUid) || byId.has(memberUid)) continue;
      byId.set(memberUid, {
        id: memberUid,
        name: entry.displayName.trim() || "Membre",
        handle: memberUid,
      });
    }
  }

  return [...byId.values()];
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
  unsub: null as Unsubscribe | null,
  partnerUnsubs: new Map<string, Unsubscribe>(),
  uid: null as string | null,
  initialized: false,
  mode: null as "inbox" | "partners" | null,
  errorNotified: false,
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
  colleagueThreadsByWorkspace: Record<string, PeopleThread[]>;
  activeFriendThreadId: string | null;

  friendThreadsList: () => PeopleThread[];
  colleagueThreadsForWorkspace: (workspaceId: string) => PeopleThread[];
  unreadCount: (workspaceId: string) => number;
  threadById: (id: string) => PeopleThread | undefined;

  hydrateFriendRequests: (uid: string | null, email: string | null) => () => void;
  subscribeFriendChats: (uid: string | null) => void;
  setActiveFriendThread: (threadId: string | null) => void;
  sendFriendRequest: (handle: string) => Promise<{ ok: boolean; error?: string }>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  declineFriendRequest: (requestId: string) => Promise<void>;
  sendMessage: (threadId: string, text: string) => void;
  markThreadRead: (threadId: string) => void;
  ensureColleagueThread: (
    workspaceId: string,
    personId: string,
    personName: string,
  ) => string;
  ensureFriendThread: (person: Person) => string;
  openMessageFromNotification: (personId: string, personName: string) => void;
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

function notificationIdForMessage(messageId: string): string {
  return `people-message-${messageId}`;
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

function pushIncomingMessageNotifications(
  partner: Person,
  messages: CloudFriendMessage[],
  localUid: string,
) {
  for (const message of messages) {
    if (message.authorUid === localUid) continue;
    useNotificationsStore.getState().push({
      id: notificationIdForMessage(message.id),
      kind: "message",
      category: "Messages",
      title: partner.name,
      body: message.text.slice(0, 160),
      messageThreadId: threadIdForFriend(partner.id),
      messagePersonId: partner.id,
      messagePersonName: partner.name,
    });
  }
}

function notificationIdForFriendRequest(requestId: string): string {
  return `friend-request-${requestId}`;
}

function syncInboxChat(
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void,
  get: () => PeopleState,
  uid: string,
  chatId: string,
  cloudMessages: CloudFriendMessage[],
  notifyIncoming: boolean,
) {
  const partnerId = partnerUidFromChatId(chatId, uid);
  if (!partnerId) return;

  const threadId = threadIdForFriend(partnerId);
  const mappedMessages = mergeCloudMessagesWithPending(
    threadId,
    cloudMessages.map((m) => ({
      id: m.id,
      author: m.authorName,
      text: m.text,
      at: cloudMessageTimestamp(m),
      mine: m.authorUid === uid,
    })),
  );

  const friendSeen = seenMessageIdsByFriend.get(partnerId) ?? new Set<string>();
  const isInitialLoad = friendSeen.size === 0;
  const newIncomingMessages = cloudMessages.filter(
    (m) => !friendSeen.has(m.id) && m.authorUid !== uid,
  );
  for (const m of cloudMessages) friendSeen.add(m.id);
  seenMessageIdsByFriend.set(partnerId, friendSeen);

  if (notifyIncoming && !isInitialLoad && newIncomingMessages.length > 0) {
    const partner = resolvePartnerPerson(get(), partnerId, cloudMessages);
    pushIncomingMessageNotifications(partner, newIncomingMessages, uid);
  }

  set((state) => {
    const partner = resolvePartnerPerson(state, partnerId, cloudMessages);
    const isViewingPerson =
      state.activeFriendThreadId != null &&
      state.threadById(state.activeFriendThreadId)?.personId === partnerId;
    const unreadDelta = isInitialLoad || isViewingPerson ? 0 : newIncomingMessages.length;
    const last = mappedMessages[mappedMessages.length - 1];
    const preview = last?.text ?? "";
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

function clearPartnerSubscriptions() {
  for (const unsub of inboxState.partnerUnsubs.values()) unsub();
  inboxState.partnerUnsubs.clear();
}

type PeopleStoreApi = {
  set: (fn: (state: PeopleState) => Partial<PeopleState>) => void;
  get: () => PeopleState;
};

function startPartnerSubscriptions({ set, get }: PeopleStoreApi, uid: string) {
  const cloudPartners = collectCloudChatPartners(get(), uid);
  const activeIds = new Set(cloudPartners.map((partner) => partner.id));

  for (const [key, unsub] of inboxState.partnerUnsubs.entries()) {
    if (!activeIds.has(key)) {
      unsub();
      inboxState.partnerUnsubs.delete(key);
    }
  }

  for (const partner of cloudPartners) {
    if (inboxState.partnerUnsubs.has(partner.id)) continue;
    const chatId = friendChatId(uid, partner.id);
    void ensureFriendChat(uid, partner.id)
      .catch(() => {})
      .finally(() => {
        if (inboxState.mode !== "partners" || inboxState.uid !== uid) return;
        if (inboxState.partnerUnsubs.has(partner.id)) return;
        const unsub = watchFriendChatMessages(
          chatId,
          (cloudMessages) => {
            syncInboxChat(set, get, uid, chatId, cloudMessages, inboxState.initialized);
          },
          (error) => {
            console.error(`Friend chat ${chatId} unavailable`, error);
          },
        );
        inboxState.partnerUnsubs.set(partner.id, unsub);
      });
  }
}

function startInboxSubscription(store: PeopleStoreApi, uid: string) {
  inboxState.unsub?.();
  inboxState.unsub = watchInboxFriendMessages(
    uid,
    (messagesByChatId) => {
      inboxState.mode = "inbox";
      clearPartnerSubscriptions();
      const notifyIncoming = inboxState.initialized;
      inboxState.initialized = true;
      for (const [chatId, cloudMessages] of Object.entries(messagesByChatId)) {
        syncInboxChat(store.set, store.get, uid, chatId, cloudMessages, notifyIncoming);
      }
    },
    (error) => {
      console.error("Friend chat inbox unavailable, falling back to per-partner listen", error);
      inboxState.unsub?.();
      inboxState.unsub = null;
      if (inboxState.mode !== "partners") {
        inboxState.mode = "partners";
        startPartnerSubscriptions(store, uid);
        inboxState.initialized = true;
        return;
      }
      if (!inboxState.errorNotified) {
        inboxState.errorNotified = true;
        useNotificationsStore.getState().push({
          kind: "message",
          title: "Messages indisponibles",
          body: error.message,
        });
      }
    },
  );
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
  colleagueThreadsByWorkspace: {},
  activeFriendThreadId: null,

  friendThreadsList: () => get().friendThreads,

  colleagueThreadsForWorkspace: (workspaceId) =>
    get().colleagueThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS,

  unreadCount: (workspaceId) => {
    const friends = get().friendThreads.reduce((s, t) => s + t.unread, 0);
    const colleagues = (
      get().colleagueThreadsByWorkspace[workspaceId] ?? EMPTY_PEOPLE_THREADS
    ).reduce((s, t) => s + t.unread, 0);
    return friends + colleagues;
  },

  threadById: (id) => {
    const friend = get().friendThreads.find((t) => t.id === id);
    if (friend) return friend;
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

  subscribeFriendChats: (uid) => {
    if (!uid) {
      inboxState.unsub?.();
      inboxState.unsub = null;
      clearPartnerSubscriptions();
      inboxState.uid = null;
      inboxState.initialized = false;
      inboxState.mode = null;
      inboxState.errorNotified = false;
      seenMessageIdsByFriend.clear();
      pendingCloudMessages.clear();
      return;
    }

    if (inboxState.uid === uid && inboxState.mode === "partners") {
      startPartnerSubscriptions({ set, get }, uid);
      return;
    }

    if (inboxState.uid === uid && inboxState.mode === "inbox" && inboxState.unsub) {
      return;
    }

    inboxState.unsub?.();
    clearPartnerSubscriptions();
    inboxState.uid = uid;
    inboxState.initialized = false;
    inboxState.mode = null;
    inboxState.errorNotified = false;
    seenMessageIdsByFriend.clear();

    startInboxSubscription({ set, get }, uid);
  },

  openMessageFromNotification: (personId, personName) => {
    const workspaceId = workspaceIdForPartner(personId);
    const threadId = workspaceId
      ? get().ensureColleagueThread(workspaceId, personId, personName)
      : get().ensureFriendThread({ id: personId, name: personName, handle: personId });
    get().markThreadRead(threadId);
    get().setActiveFriendThread(threadId);
    useStore.getState().switchChatPanelMode("friends");
  },

  setActiveFriendThread: (threadId) => {
    set((state) => {
      if (state.activeFriendThreadId === threadId) return state;
      const next: Partial<PeopleState> = { activeFriendThreadId: threadId };
      if (threadId) {
        next.friendThreads = state.friendThreads.map((t) =>
          t.id === threadId ? { ...t, unread: 0 } : t,
        );
        next.colleagueThreadsByWorkspace = Object.fromEntries(
          Object.entries(state.colleagueThreadsByWorkspace).map(([ws, threads]) => [
            ws,
            threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)),
          ]),
        );
      }
      return next as PeopleState;
    });
  },

  markThreadRead: (threadId) => {
    const patch = (t: PeopleThread) =>
      t.id === threadId ? { ...t, unread: 0 } : t;

    set({
      friendThreads: get().friendThreads.map(patch),
      colleagueThreadsByWorkspace: Object.fromEntries(
        Object.entries(get().colleagueThreadsByWorkspace).map(([ws, threads]) => [
          ws,
          threads.map(patch),
        ]),
      ),
    });
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
