import {
  addDoc,
  collection,
  doc,
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
import type { CloudFriendMessage } from "./friendChats";
import type { PeopleManageScheduleEvent } from "../peopleChat";

export interface CloudGroupChat {
  id: string;
  name: string;
  participants: string[];
  creatorUid: string;
  memberNames?: Record<string, string>;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
  lastPreview?: string;
  lastMessageAuthorUid?: string;
  lastMessageKind?: "text" | "handoff" | "manage";
  lastHandoffTitle?: string;
}

export const GROUP_CHAT_MESSAGE_PAGE_SIZE = 80;

function groupRef(groupId: string) {
  return doc(db, "groupChats", groupId);
}

function messagesCol(groupId: string) {
  return collection(db, "groupChats", groupId, "messages");
}

export async function createGroupChatDoc(opts: {
  groupId: string;
  name: string;
  participants: string[];
  creatorUid: string;
  memberNames: Record<string, string>;
}): Promise<string> {
  const participants = [...new Set(opts.participants)].sort();
  await setDoc(groupRef(opts.groupId), {
    name: opts.name.trim() || "Groupe",
    participants,
    creatorUid: opts.creatorUid,
    memberNames: opts.memberNames,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return opts.groupId;
}

export async function sendGroupChatMessage(
  groupId: string,
  authorUid: string,
  authorName: string,
  participants: string[],
  text: string,
  extras?: {
    kind?: "text" | "handoff" | "manage";
    handoffId?: string;
    handoffTitle?: string;
    handoffPreview?: string;
    manageDisplayText?: string;
    manageEvents?: PeopleManageScheduleEvent[];
    manageSummary?: string;
  },
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const sortedParticipants = [...new Set(participants)].sort();
  const previewText =
    extras?.kind === "handoff"
      ? extras.handoffTitle?.trim() || trimmed
      : extras?.kind === "manage"
        ? extras.manageDisplayText?.trim() || trimmed
        : trimmed;
  await addDoc(messagesCol(groupId), {
    authorUid,
    authorName: authorName.trim() || authorUid,
    text: trimmed,
    participants: sortedParticipants,
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
  });
  await setDoc(
    groupRef(groupId),
    {
      participants: sortedParticipants,
      updatedAt: serverTimestamp(),
      lastPreview: previewText.slice(0, 200),
      lastMessageAuthorUid: authorUid,
      lastMessageKind:
        extras?.kind === "handoff"
          ? "handoff"
          : extras?.kind === "manage"
            ? "manage"
            : "text",
      ...(extras?.kind === "handoff" && extras.handoffTitle
        ? { lastHandoffTitle: extras.handoffTitle.slice(0, 200) }
        : {}),
    },
    { merge: true },
  );
}

function mapGroupDoc(docSnap: QueryDocumentSnapshot<DocumentData>): CloudGroupChat {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    name: typeof data.name === "string" ? data.name : "Groupe",
    participants: Array.isArray(data.participants)
      ? data.participants.filter((id): id is string => typeof id === "string")
      : [],
    creatorUid: typeof data.creatorUid === "string" ? data.creatorUid : "",
    memberNames:
      data.memberNames && typeof data.memberNames === "object"
        ? (data.memberNames as Record<string, string>)
        : undefined,
    updatedAt: data.updatedAt ?? null,
    lastPreview: typeof data.lastPreview === "string" ? data.lastPreview : undefined,
    lastMessageAuthorUid:
      typeof data.lastMessageAuthorUid === "string" ? data.lastMessageAuthorUid : undefined,
    lastMessageKind:
      data.lastMessageKind === "handoff" ||
      data.lastMessageKind === "manage" ||
      data.lastMessageKind === "text"
        ? data.lastMessageKind
        : undefined,
    lastHandoffTitle:
      typeof data.lastHandoffTitle === "string" ? data.lastHandoffTitle : undefined,
  };
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

function messageSortKey(message: CloudFriendMessage): number {
  if (typeof message.clientCreatedAt === "number") return message.clientCreatedAt;
  const createdAt = message.createdAt;
  if (createdAt && typeof createdAt === "object" && "seconds" in createdAt) {
    return createdAt.seconds * 1000 + Math.floor(createdAt.nanoseconds / 1_000_000);
  }
  return 0;
}

export function watchGroupChats(
  localUid: string,
  onChange: (groups: CloudGroupChat[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!localUid) {
    onChange([]);
    return () => {};
  }

  const groupsQuery = query(
    collection(db, "groupChats"),
    where("participants", "array-contains", localUid),
  );

  return onSnapshot(
    groupsQuery,
    (snap) => {
      onChange(snap.docs.map((docSnap) => mapGroupDoc(docSnap)));
    },
    onError,
  );
}

export function watchGroupChatMessages(
  groupId: string,
  onChange: (messages: CloudFriendMessage[]) => void,
  onError?: (error: Error) => void,
  pageSize = GROUP_CHAT_MESSAGE_PAGE_SIZE,
): Unsubscribe {
  const messagesQuery =
    pageSize > 0
      ? query(
          messagesCol(groupId),
          orderBy("clientCreatedAt", "desc"),
          limit(pageSize),
        )
      : messagesCol(groupId);

  return onSnapshot(
    messagesQuery,
    (snap) => {
      onChange(sortMessages(snap.docs.map((d) => mapMessageDoc(d))));
    },
    onError,
  );
}
