import {
  addDoc,
  collection,
  collectionGroup,
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

function chatIdFromMessageDoc(docSnap: QueryDocumentSnapshot<DocumentData>): string | null {
  return docSnap.ref.parent.parent?.id ?? null;
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

/** Écoute tous les messages où l'utilisateur est participant (inbox temps réel). */
export function watchInboxFriendMessages(
  localUid: string,
  onChange: (messagesByChatId: Record<string, CloudFriendMessage[]>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!localUid) {
    onChange({});
    return () => {};
  }

  const inboxQuery = query(
    collectionGroup(db, "messages"),
    where("participants", "array-contains", localUid),
  );

  return onSnapshot(
    inboxQuery,
    (snap) => {
      const messagesByChatId: Record<string, CloudFriendMessage[]> = {};
      for (const docSnap of snap.docs) {
        const chatId = chatIdFromMessageDoc(docSnap);
        if (!chatId) continue;
        const bucket = messagesByChatId[chatId] ?? [];
        bucket.push(mapMessageDoc(docSnap));
        messagesByChatId[chatId] = bucket;
      }
      for (const chatId of Object.keys(messagesByChatId)) {
        messagesByChatId[chatId] = sortMessages(messagesByChatId[chatId]!);
      }
      onChange(messagesByChatId);
    },
    onError,
  );
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
