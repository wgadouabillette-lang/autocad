import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";

export interface CloudFriendMessage {
  id: string;
  authorUid: string;
  authorName: string;
  text: string;
  clientCreatedAt?: number;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

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
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(messagesCol(chatId), {
    authorUid,
    authorName: authorName.trim() || authorUid,
    text: trimmed,
    participants: [...participants].sort(),
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
  });
  await setDoc(
    chatRef(chatId),
    { participants: [...participants].sort(), updatedAt: serverTimestamp() },
    { merge: true },
  );
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
): Unsubscribe {
  return onSnapshot(
    messagesCol(chatId),
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
