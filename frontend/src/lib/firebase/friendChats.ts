import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
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

export function watchFriendChatMessages(
  chatId: string,
  onChange: (messages: CloudFriendMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    messagesCol(chatId),
    (snap) => {
      onChange(
        snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CloudFriendMessage, "id">),
          }))
          .sort((a, b) => messageSortKey(a) - messageSortKey(b)),
      );
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
