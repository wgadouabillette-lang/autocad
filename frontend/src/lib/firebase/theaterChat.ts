import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
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
): Promise<string | null> {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId || !authorUid) return null;
  const ref = await addDoc(messagesCol(trimmedId), {
    authorUid,
    authorName: authorName.trim() || "Membre",
    authorPhotoURL,
    kind: "hand_raise",
    clientCreatedAt: Date.now(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteTheaterHandRaiseMessage(
  workspaceId: string,
  messageId: string,
): Promise<void> {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId || !messageId) return;
  await deleteDoc(doc(messagesCol(trimmedId), messageId));
}

/** Fallback when the doc id was not tracked locally (race or reload). */
export async function deleteTheaterHandRaiseNoticesForAuthor(
  workspaceId: string,
  authorUid: string,
): Promise<void> {
  const trimmedId = workspaceId.trim().toLowerCase();
  if (!trimmedId || !authorUid) return;
  const q = query(
    messagesCol(trimmedId),
    where("authorUid", "==", authorUid),
    where("kind", "==", "hand_raise"),
    limit(8),
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((docSnap) => deleteDoc(docSnap.ref)));
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
