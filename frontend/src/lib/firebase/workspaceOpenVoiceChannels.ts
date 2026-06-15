import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  deleteDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";

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
  await setDoc(channelRef(workspaceId, channelId), {
    id: channelId,
    workspaceId,
    name: name.trim() || "Salon vocal",
    createdAt: serverTimestamp(),
  });
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
