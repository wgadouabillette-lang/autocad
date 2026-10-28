import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./client";

export interface OpenVoiceChannelDoc {
  id: string;
  workspaceId: string;
  name: string;
  createdAt?: unknown;
}

function channelsCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId, "openVoiceChannels");
}

function channelRef(workspaceId: string, channelId: string) {
  return doc(db, "workspacesShared", workspaceId, "openVoiceChannels", channelId);
}

export async function upsertOpenVoiceChannel(
  workspaceId: string,
  channelId: string,
  name: string,
): Promise<void> {
  const ref = channelRef(workspaceId, channelId);
  const existing = await getDoc(ref);
  const payload: {
    id: string;
    workspaceId: string;
    name: string;
    createdAt: ReturnType<typeof serverTimestamp>;
    createdByUid?: string;
  } = {
    id: channelId,
    workspaceId,
    name: name.trim() || "Salon vocal",
    createdAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    payload.createdByUid = uid;
  }
  await setDoc(ref, payload, { merge: true });
}

export async function removeOpenVoiceChannel(
  workspaceId: string,
  channelId: string,
): Promise<void> {
  await deleteDoc(channelRef(workspaceId, channelId));
}

export function watchOpenVoiceChannels(
  workspaceId: string,
  onChange: (channels: OpenVoiceChannelDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    channelsCol(workspaceId),
    (snap) => {
      const channels = snap.docs.map((entry) => entry.data() as OpenVoiceChannelDoc);
      onChange(channels);
    },
    onError,
  );
}
