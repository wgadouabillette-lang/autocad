import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

export interface WorkspaceVoicePresence {
  inPrivateCall: boolean;
  openChannelId: string | null;
}

export interface WorkspacePresenceDoc {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeen?: { seconds: number; nanoseconds: number };
  voiceInPrivateCall?: boolean;
  voiceOpenChannelId?: string | null;
}

export interface WorkspacePresenceMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
  voice: WorkspaceVoicePresence;
}

function voiceFromDoc(data: WorkspacePresenceDoc): WorkspaceVoicePresence {
  return {
    inPrivateCall: data.voiceInPrivateCall === true,
    openChannelId:
      typeof data.voiceOpenChannelId === "string" && data.voiceOpenChannelId
        ? data.voiceOpenChannelId
        : null,
  };
}

function presenceCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId, "presence");
}

function presenceRef(workspaceId: string, uid: string) {
  return doc(db, "workspacesShared", workspaceId, "presence", uid);
}

function lastSeenToMs(lastSeen: WorkspacePresenceDoc["lastSeen"]): number {
  if (!lastSeen || typeof lastSeen.seconds !== "number") return 0;
  return lastSeen.seconds * 1000 + Math.floor(lastSeen.nanoseconds / 1_000_000);
}

export function watchWorkspacePresence(
  workspaceId: string,
  onChange: (members: WorkspacePresenceMember[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    presenceCol(workspaceId),
    (snap) => {
      const members = snap.docs.map((entry) => {
        const data = entry.data() as WorkspacePresenceDoc;
        return {
          uid: data.uid ?? entry.id,
          displayName: data.displayName?.trim() || "Membre",
          photoURL: data.photoURL,
          lastSeenMs: lastSeenToMs(data.lastSeen),
          voice: voiceFromDoc(data),
        };
      });
      onChange(members);
    },
    onError,
  );
}

export async function touchWorkspacePresence(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  voice?: WorkspaceVoicePresence,
): Promise<void> {
  if (!workspaceId || !uid) return;
  const payload: Record<string, unknown> = {
    uid,
    displayName: profile.displayName.trim() || "Membre",
    photoURL: profile.photoURL ? profile.photoURL : deleteField(),
    lastSeen: serverTimestamp(),
  };
  if (voice) {
    payload.voiceInPrivateCall = voice.inPrivateCall;
    payload.voiceOpenChannelId = voice.openChannelId ?? deleteField();
  }
  await setDoc(presenceRef(workspaceId, uid), payload, { merge: true });
}

export async function pushWorkspaceVoiceState(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  voice: WorkspaceVoicePresence,
): Promise<void> {
  await touchWorkspacePresence(workspaceId, uid, profile, voice);
}

export async function pushProfileToJoinedWorkspaces(
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
): Promise<void> {
  const workspaces = useWorkspacesStore.getState().joinedWorkspaces(uid);
  await Promise.all(
    workspaces.map((workspace) => touchWorkspacePresence(workspace.id, uid, profile)),
  );
}
