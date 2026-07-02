import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";
import type { PeopleManageScheduleEvent } from "../peopleChat";

export interface CloudFriendMessage {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  clientCreatedAt?: number;
  createdAt?: { seconds: number; nanoseconds: number } | null;
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
  mentionedUids?: string[];
  mentionBroadcast?: "here" | "everyone";
}

export interface CloudFriendChat {
  id: string;
  participants: string[];
  updatedAt?: { seconds: number; nanoseconds: number } | null;
  lastPreview?: string;
  lastMessageAuthorUid?: string;
  lastMessageKind?: "text" | "handoff" | "manage" | "meeting";
  lastHandoffTitle?: string;
}

export const FRIEND_CHAT_MESSAGE_PAGE_SIZE = 80;

export function friendChatId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("_");
}

export function partnerUidFromChatId(chatId: string, localUid: string): string | null {
  const parts = chatId.split("_");
  if (parts.length !== 2) return null;
  return parts.find((part) => part && part !== localUid) ?? null;
}

function chatRef(chatId: string) {
  return doc(db, "friendChats", chatId);
}

function messagesCol(chatId: string) {
  return collection(db, "friendChats", chatId, "messages");
}

export async function ensureFriendChat(uidA: string, uidB: string): Promise<string> {
  const participants = [uidA, uidB].sort();
  const chatId = participants.join("_");
  await setDoc(
    chatRef(chatId),
    { participants, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return chatId;
}

export async function sendFriendChatMessage(
  chatId: string,
  authorUid: string,
  authorName: string,
  participants: string[],
  text: string,
  extras?: {
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
  },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const previewText =
    extras?.kind === "handoff"
      ? extras.handoffTitle?.trim() || trimmed
      : extras?.kind === "manage"
        ? extras.manageDisplayText?.trim() || trimmed
        : extras?.kind === "meeting"
          ? extras.meetingTitle?.trim() || trimmed
          : trimmed;
  await addDoc(messagesCol(chatId), {
    authorUid,
    authorName: authorName.trim() || authorUid,
    text: trimmed,
    participants: [...participants].sort(),
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
    ...(extras?.kind === "handoff" && extras.handoffId
      ? {
          kind: "handoff",
          handoffId: extras.handoffId,
          handoffTitle: extras.handoffTitle ?? "",
          handoffPreview: extras.handoffPreview ?? "",
        }
      : {}),
    ...(extras?.kind === "manage" && extras.manageEvents?.length
      ? {
          kind: "manage",
          manageDisplayText: extras.manageDisplayText ?? trimmed,
          manageEvents: extras.manageEvents,
          manageSummary: extras.manageSummary ?? "",
        }
      : {}),
    ...(extras?.kind === "meeting"
      ? {
          kind: "meeting",
          meetingTitle: extras.meetingTitle ?? "",
          meetingDateKey: extras.meetingDateKey ?? "",
          meetingStartTime: extras.meetingStartTime ?? "",
          meetingEndTime: extras.meetingEndTime ?? "",
          meetingOrganizerName: extras.meetingOrganizerName ?? authorName,
        }
      : {}),
  });
  await setDoc(
    chatRef(chatId),
    {
      participants: [...participants].sort(),
      updatedAt: serverTimestamp(),
      lastPreview: previewText.slice(0, 200),
      lastMessageAuthorUid: authorUid,
      lastMessageKind:
        extras?.kind === "handoff"
          ? "handoff"
          : extras?.kind === "manage"
            ? "manage"
            : extras?.kind === "meeting"
              ? "meeting"
              : "text",
      ...(extras?.kind === "handoff" && extras.handoffTitle
        ? { lastHandoffTitle: extras.handoffTitle.slice(0, 200) }
        : {}),
    },
    { merge: true },
  );
}

function mapChatDoc(docSnap: QueryDocumentSnapshot<DocumentData>): CloudFriendChat {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    participants: Array.isArray(data.participants)
      ? data.participants.filter((id): id is string => typeof id === "string")
      : [],
    updatedAt: data.updatedAt ?? null,
    lastPreview: typeof data.lastPreview === "string" ? data.lastPreview : undefined,
    lastMessageAuthorUid:
      typeof data.lastMessageAuthorUid === "string" ? data.lastMessageAuthorUid : undefined,
    lastMessageKind:
      data.lastMessageKind === "handoff" ||
      data.lastMessageKind === "manage" ||
      data.lastMessageKind === "meeting" ||
      data.lastMessageKind === "text"
        ? data.lastMessageKind
        : undefined,
    lastHandoffTitle:
      typeof data.lastHandoffTitle === "string" ? data.lastHandoffTitle : undefined,
  };
}

function chatUpdatedAtMillis(chat: CloudFriendChat): number {
  const updatedAt = chat.updatedAt;
  if (updatedAt && typeof updatedAt === "object" && "seconds" in updatedAt) {
    return updatedAt.seconds * 1000 + Math.floor(updatedAt.nanoseconds / 1_000_000);
  }
  return 0;
}

/** Métadonnées des conversations (sans messages) — léger pour l'inbox. */
export function watchFriendChats(
  localUid: string,
  onChange: (chats: CloudFriendChat[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!localUid) {
    onChange([]);
    return () => {};
  }

  const chatsQuery = query(
    collection(db, "friendChats"),
    where("participants", "array-contains", localUid),
  );

  return onSnapshot(
    chatsQuery,
    (snap) => {
      onChange(
        snap.docs
          .map((docSnap) => mapChatDoc(docSnap))
          .sort((a, b) => chatUpdatedAtMillis(b) - chatUpdatedAtMillis(a)),
      );
    },
    onError,
  );
}

export async function fetchLatestFriendMessage(
  chatId: string,
): Promise<CloudFriendMessage | null> {
  const snap = await getDocs(
    query(
      messagesCol(chatId),
      orderBy("clientCreatedAt", "desc"),
      limit(1),
    ),
  );
  if (snap.empty) return null;
  return mapMessageDoc(snap.docs[0]!);
}

function mapMessageDoc(docSnap: QueryDocumentSnapshot<DocumentData>): CloudFriendMessage {
  return {
    id: docSnap.id,
    ...(docSnap.data() as Omit<CloudFriendMessage, "id">),
  };
}

function sortMessages(messages: CloudFriendMessage[]): CloudFriendMessage[] {
  return [...messages].sort((a, b) => messageSortKey(a) - messageSortKey(b));
}

/** Écoute tous les chats amis puis leurs messages (inbox temps réel). */
export function watchInboxFriendMessages(
  localUid: string,
  onChange: (messagesByChatId: Record<string, CloudFriendMessage[]>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!localUid) {
    onChange({});
    return () => {};
  }

  const messagesByChatId: Record<string, CloudFriendMessage[]> = {};
  const messageUnsubs = new Map<string, Unsubscribe>();

  const emit = () => {
    onChange({ ...messagesByChatId });
  };

  const chatsQuery = query(
    collection(db, "friendChats"),
    where("participants", "array-contains", localUid),
  );

  const chatsUnsub = onSnapshot(
    chatsQuery,
    (chatSnap) => {
      const activeChatIds = new Set<string>();

      for (const chatDoc of chatSnap.docs) {
        const chatId = chatDoc.id;
        activeChatIds.add(chatId);
        if (messageUnsubs.has(chatId)) continue;

        messageUnsubs.set(
          chatId,
          watchFriendChatMessages(
            chatId,
            (messages) => {
              messagesByChatId[chatId] = messages;
              emit();
            },
            onError,
          ),
        );
      }

      for (const [chatId, unsub] of messageUnsubs.entries()) {
        if (activeChatIds.has(chatId)) continue;
        unsub();
        messageUnsubs.delete(chatId);
        delete messagesByChatId[chatId];
      }

      emit();
    },
    onError,
  );

  return () => {
    chatsUnsub();
    for (const unsub of messageUnsubs.values()) unsub();
    messageUnsubs.clear();
  };
}

export function watchFriendChatMessages(
  chatId: string,
  onChange: (messages: CloudFriendMessage[]) => void,
  onError?: (error: Error) => void,
  pageSize = FRIEND_CHAT_MESSAGE_PAGE_SIZE,
): Unsubscribe {
  const messagesQuery =
    pageSize > 0
      ? query(
          messagesCol(chatId),
          orderBy("clientCreatedAt", "desc"),
          limit(pageSize),
        )
      : messagesCol(chatId);

  return onSnapshot(
    messagesQuery,
    (snap) => {
      onChange(sortMessages(snap.docs.map((d) => mapMessageDoc(d))));
    },
    onError,
  );
}

function messageSortKey(message: CloudFriendMessage): number {
  if (typeof message.clientCreatedAt === "number") return message.clientCreatedAt;
  const createdAt = message.createdAt;
  if (createdAt && typeof createdAt === "object" && "seconds" in createdAt) {
    return createdAt.seconds * 1000 + Math.floor(createdAt.nanoseconds / 1_000_000);
  }
  return 0;
}
