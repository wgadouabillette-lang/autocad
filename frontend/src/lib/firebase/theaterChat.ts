import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";

export type CloudTheaterChatKind = "text" | "hand_raise";

export interface CloudTheaterChatMessage {
  id: string;
  authorUid: string;
  authorName: string;
  authorPhotoURL?: string | null;
  kind: CloudTheaterChatKind;
  text?: string;
  clientCreatedAt: number;
}

const THEATER_CHAT_PAGE_SIZE = 120;

function messagesCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId.trim().toLowerCase(), "theaterChat");
}

function mapMessageDoc(docSnap: QueryDocumentSnapshot<DocumentData>): CloudTheaterChatMessage {
  const data = docSnap.data();
  const kind = data.kind === "hand_raise" ? "hand_raise" : "text";
  return {
    id: docSnap.id,
    authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
    authorName: typeof data.authorName === "string" ? data.authorName : "Membre",
    authorPhotoURL:
      typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : data.authorPhotoURL ?? null,
    kind,
    text: typeof data.text === "string" ? data.text : undefined,
    clientCreatedAt:
      typeof data.clientCreatedAt === "number" && Number.isFinite(data.clientCreatedAt)
        ? data.clientCreatedAt
        : Date.now(),
  };
}

export async function sendTheaterHandRaiseNotice(
  workspaceId: string,
  authorUid: string,
  authorName: string,
  authorPhotoURL: string | null,
): Promise<void> {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId || !authorUid) return;
  await addDoc(messagesCol(trimmedId), {
    authorUid,
    authorName: authorName.trim() || "Membre",
    authorPhotoURL,
    kind: "hand_raise",
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
  });
}

export function watchTheaterChatMessages(
  workspaceId: string,
  onChange: (messages: CloudTheaterChatMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId) {
    onChange([]);
    return () => {};
  }

  const q = query(
    messagesCol(trimmedId),
    orderBy("clientCreatedAt", "asc"),
    limit(THEATER_CHAT_PAGE_SIZE),
  );

  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((docSnap) => mapMessageDoc(docSnap)));
    },
    onError,
  );
}
