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

import type { PresenceActivityId } from "../presenceActivity";

export interface WorkspaceVoicePresence {
  inPrivateCall: boolean;
  openChannelId: string | null;
  speaking?: boolean;
}

export interface WorkspacePresenceDoc {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeen?: { seconds: number; nanoseconds: number };
  voiceInPrivateCall?: boolean;
  voiceOpenChannelId?: string | null;
  voiceSpeaking?: boolean;
  presenceActivity?: string | null;
}

export interface WorkspacePresenceMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
  voice: WorkspaceVoicePresence;
  presenceActivity: PresenceActivityId | null;
}

function activityFromDoc(data: WorkspacePresenceDoc): PresenceActivityId | null {
  const value = data.presenceActivity;
  if (typeof value !== "string" || !value || value === "none") return null;
  return value as PresenceActivityId;
}

function voiceFromDoc(data: WorkspacePresenceDoc): WorkspaceVoicePresence {
  return {
    inPrivateCall: data.voiceInPrivateCall === true,
    openChannelId:
      typeof data.voiceOpenChannelId === "string" && data.voiceOpenChannelId
        ? data.voiceOpenChannelId
        : null,
    speaking: data.voiceSpeaking === true,
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
          presenceActivity: activityFromDoc(data),
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
  presenceActivity?: PresenceActivityId | null,
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
    payload.voiceSpeaking = voice.speaking === true;
  }
  if (presenceActivity !== undefined) {
    payload.presenceActivity =
      presenceActivity && presenceActivity !== "none" ? presenceActivity : deleteField();
  }
  await setDoc(presenceRef(workspaceId, uid), payload, { merge: true });
}

export async function pushWorkspacePresenceActivity(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  presenceActivity: PresenceActivityId | null,
): Promise<void> {
  await touchWorkspacePresence(workspaceId, uid, profile, undefined, presenceActivity);
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
