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

export interface WorkspacePresenceDoc {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeen?: { seconds: number; nanoseconds: number };
}

export interface WorkspacePresenceMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
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
): Promise<void> {
  if (!workspaceId || !uid) return;
  await setDoc(
    presenceRef(workspaceId, uid),
    {
      uid,
      displayName: profile.displayName.trim() || "Membre",
      photoURL: profile.photoURL ? profile.photoURL : deleteField(),
      lastSeen: serverTimestamp(),
    },
    { merge: true },
  );
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
