import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";
import type { CloudFriendMessage } from "./friendChats";

export interface WorkspaceTextChannelDoc {
  id: string;
  workspaceId: string;
  name: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastPreview?: string;
  lastMessageAuthorUid?: string;
}

export const WORKSPACE_TEXT_CHANNEL_MESSAGE_PAGE_SIZE = 80;

function channelsCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId, "textChannels");
}

function channelRef(workspaceId: string, channelId: string) {
  return doc(db, "workspacesShared", workspaceId, "textChannels", channelId);
}

function messagesCol(workspaceId: string, channelId: string) {
  return collection(db, "workspacesShared", workspaceId, "textChannels", channelId, "messages");
}

export async function upsertWorkspaceTextChannel(
  workspaceId: string,
  channelId: string,
  name: string,
  createdByUid?: string,
): Promise<void> {
  const trimmedName = name.trim() || "general";
  await setDoc(
    channelRef(workspaceId, channelId),
    {
      id: channelId,
      workspaceId,
      name: trimmedName,
      updatedAt: serverTimestamp(),
      ...(createdByUid ? { createdByUid, createdAt: serverTimestamp() } : {}),
    },
    { merge: true },
  );
}

export async function removeWorkspaceTextChannel(
  workspaceId: string,
  channelId: string,
): Promise<void> {
  if (!workspaceId || !channelId) return;
  await deleteDoc(channelRef(workspaceId, channelId));
}

export function watchWorkspaceTextChannels(
  workspaceId: string,
  onChange: (channels: WorkspaceTextChannelDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    channelsCol(workspaceId),
    (snap) => {
      const channels = snap.docs.map((entry) => entry.data() as WorkspaceTextChannelDoc);
      onChange(channels);
    },
    onError,
  );
}

function mapMessageDoc(docSnap: QueryDocumentSnapshot<DocumentData>): CloudFriendMessage {
  return {
    id: docSnap.id,
    ...(docSnap.data() as Omit<CloudFriendMessage, "id">),
  };
}

function sortMessages(messages: CloudFriendMessage[]): CloudFriendMessage[] {
  return [...messages].sort((a, b) => {
    const aKey =
      typeof a.clientCreatedAt === "number"
        ? a.clientCreatedAt
        : a.createdAt && typeof a.createdAt === "object" && "seconds" in a.createdAt
          ? a.createdAt.seconds * 1000
          : 0;
    const bKey =
      typeof b.clientCreatedAt === "number"
        ? b.clientCreatedAt
        : b.createdAt && typeof b.createdAt === "object" && "seconds" in b.createdAt
          ? b.createdAt.seconds * 1000
          : 0;
    return aKey - bKey;
  });
}

export function watchWorkspaceTextChannelMessages(
  workspaceId: string,
  channelId: string,
  onChange: (messages: CloudFriendMessage[]) => void,
  onError?: (error: Error) => void,
  pageSize = WORKSPACE_TEXT_CHANNEL_MESSAGE_PAGE_SIZE,
): Unsubscribe {
  if (!workspaceId || !channelId) {
    onChange([]);
    return () => {};
  }

  const messagesQuery =
    pageSize > 0
      ? query(
          messagesCol(workspaceId, channelId),
          orderBy("clientCreatedAt", "desc"),
          limit(pageSize),
        )
      : messagesCol(workspaceId, channelId);

  return onSnapshot(
    messagesQuery,
    (snap) => {
      onChange(sortMessages(snap.docs.map((entry) => mapMessageDoc(entry))));
    },
    onError,
  );
}

export async function sendWorkspaceTextChannelMessage(
  workspaceId: string,
  channelId: string,
  authorUid: string,
  authorName: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || !workspaceId || !channelId || !authorUid) return;

  await addDoc(messagesCol(workspaceId, channelId), {
    authorUid,
    authorName: authorName.trim() || authorUid,
    text: trimmed,
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
  });

  await setDoc(
    channelRef(workspaceId, channelId),
    {
      updatedAt: serverTimestamp(),
      lastPreview: trimmed.slice(0, 200),
      lastMessageAuthorUid: authorUid,
    },
    { merge: true },
  );
}
