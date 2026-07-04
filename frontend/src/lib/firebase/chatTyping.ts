import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import type { ChatTypingScope } from "../chatTypingScope";
import { db } from "./client";

export interface CloudChatTyper {
  userId: string;
  name: string;
  photoURL: string | null;
  updatedAt: number;
}

const TYPING_STALE_MS = 5_000;

function typingCollection(scope: ChatTypingScope): CollectionReference {
  switch (scope.kind) {
    case "theater":
      return collection(db, "workspacesShared", scope.workspaceId, "theaterTyping");
    case "friend":
      return collection(db, "friendChats", scope.chatId, "typing");
    case "group":
      return collection(db, "groupChats", scope.groupId, "typing");
    case "workspace-channel":
      return collection(
        db,
        "workspacesShared",
        scope.workspaceId,
        "textChannels",
        scope.channelId,
        "typing",
      );
  }
}

function typingRef(scope: ChatTypingScope, uid: string) {
  return doc(typingCollection(scope), uid);
}

function mapTypingDoc(docSnap: QueryDocumentSnapshot<DocumentData>): CloudChatTyper | null {
  const data = docSnap.data();
  const updatedAt =
    typeof data.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : Date.now();
  if (Date.now() - updatedAt > TYPING_STALE_MS) return null;

  return {
    userId: docSnap.id,
    name: typeof data.authorName === "string" ? data.authorName : "Membre",
    photoURL:
      typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : data.authorPhotoURL ?? null,
    updatedAt,
  };
}

export async function setChatTyping(
  scope: ChatTypingScope,
  uid: string,
  authorName: string,
  authorPhotoURL: string | null,
): Promise<void> {
  if (!uid) return;

  await setDoc(
    typingRef(scope, uid),
    {
      authorUid: uid,
      authorName: authorName.trim() || "Membre",
      authorPhotoURL,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function clearChatTyping(scope: ChatTypingScope, uid: string): Promise<void> {
  if (!uid) return;

  try {
    await deleteDoc(typingRef(scope, uid));
  } catch {
    // Déjà supprimé ou indisponible.
  }
}

export function watchChatTyping(
  scope: ChatTypingScope,
  onChange: (typers: CloudChatTyper[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    typingCollection(scope),
    (snap) => {
      const typers = snap.docs
        .map((docSnap) => mapTypingDoc(docSnap))
        .filter((typer): typer is CloudChatTyper => typer !== null);
      onChange(typers);
    },
    onError,
  );
}

export { TYPING_STALE_MS };
