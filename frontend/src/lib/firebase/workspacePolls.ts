import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { VoicePoll } from "../voicePoll";
import { db } from "./client";

const ACTIVE_POLL_ID = "active";

export interface VoicePollDoc {
  id: string;
  workspaceId: string;
  question: string;
  subtitle: string;
  options: Array<{ id: string; label: string }>;
  votesByUserId: Record<string, string>;
  createdByUserId: string;
  createdByName: string;
  status: "open" | "closed";
  createdAt: number;
  expiresAt: number;
  updatedAt?: unknown;
}

function pollRef(workspaceId: string) {
  return doc(db, "workspacesShared", workspaceId, "voicePoll", ACTIVE_POLL_ID);
}

function pollFromDoc(data: VoicePollDoc): VoicePoll {
  return {
    id: data.id,
    workspaceId: data.workspaceId,
    question: data.question,
    subtitle: data.subtitle ?? "",
    options: data.options ?? [],
    votesByUserId: data.votesByUserId ?? {},
    createdByUserId: data.createdByUserId,
    createdByName: data.createdByName,
    status: data.status === "closed" ? "closed" : "open",
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };
}

export async function publishWorkspacePoll(poll: VoicePoll): Promise<void> {
  const payload: VoicePollDoc = {
    ...poll,
    updatedAt: serverTimestamp(),
  };
  await setDoc(pollRef(poll.workspaceId), payload);
}

export async function voteWorkspacePoll(
  workspaceId: string,
  voterUid: string,
  optionId: string,
): Promise<void> {
  await updateDoc(pollRef(workspaceId), {
    [`votesByUserId.${voterUid}`]: optionId,
    updatedAt: serverTimestamp(),
  });
}

export async function closeWorkspacePoll(workspaceId: string): Promise<void> {
  await updateDoc(pollRef(workspaceId), {
    status: "closed",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWorkspacePoll(workspaceId: string): Promise<void> {
  await deleteDoc(pollRef(workspaceId));
}

export async function clearWorkspacePoll(workspaceId: string): Promise<void> {
  await deleteWorkspacePoll(workspaceId);
}

export function watchWorkspacePoll(
  workspaceId: string,
  onChange: (poll: VoicePoll | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    pollRef(workspaceId),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      const data = snap.data() as VoicePollDoc;
      if (!data.id || !data.question) {
        onChange(null);
        return;
      }
      onChange(pollFromDoc(data));
    },
    onError,
  );
}
