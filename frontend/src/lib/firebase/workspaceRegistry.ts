import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import type { Workspace } from "../workspaces";
import { db } from "./client";

export type WorkspaceJoinRequestStatus = "pending" | "accepted" | "declined";

export interface SharedWorkspaceDoc {
  id: string;
  name: string;
  accent: string;
  iconURL?: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: number;
  enterpriseSubscriptionPlan?: "free" | "enterprise";
  enterpriseBillingManaged?: boolean;
  enterpriseMemberCount?: number;
  enterpriseSeatCount?: number;
  membersCanInvite?: boolean;
}

export interface WorkspaceJoinRequestDoc {
  requesterUid: string;
  requesterName: string;
  requesterEmail: string;
  status: WorkspaceJoinRequestStatus;
  createdAt?: unknown;
  respondedAt?: unknown;
}

function sharedWorkspaceRef(workspaceId: string) {
  return doc(db, "workspacesShared", workspaceId);
}

function joinRequestRef(workspaceId: string, requesterUid: string) {
  return doc(db, "workspacesShared", workspaceId, "joinRequests", requesterUid);
}

function joinRequestsCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId, "joinRequests");
}

function workspaceMemberRef(workspaceId: string, memberUid: string) {
  return doc(db, "workspacesShared", workspaceId, "members", memberUid);
}

export function toSharedWorkspaceDoc(workspace: Workspace): SharedWorkspaceDoc {
  return {
    id: workspace.id,
    name: workspace.name,
    accent: workspace.accent,
    ...(workspace.iconURL !== undefined ? { iconURL: workspace.iconURL } : {}),
    ownerId: workspace.ownerId,
    ownerName: workspace.ownerName,
    createdAt: workspace.createdAt,
    ...(workspace.membersCanInvite === false ? { membersCanInvite: false } : {}),
  };
}

export function sharedDocToWorkspace(data: SharedWorkspaceDoc): Workspace {
  return {
    id: data.id,
    name: data.name,
    accent: data.accent,
    iconURL: data.iconURL ?? undefined,
    ownerId: data.ownerId,
    ownerName: data.ownerName,
    createdAt: data.createdAt,
    membersCanInvite: data.membersCanInvite,
  };
}

export function watchSharedWorkspace(
  workspaceId: string,
  onChange: (workspace: Workspace | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    sharedWorkspaceRef(trimmed),
    (snap) => {
      onChange(snap.exists() ? sharedDocToWorkspace(snap.data() as SharedWorkspaceDoc) : null);
    },
    onError,
  );
}

export async function publishSharedWorkspace(workspace: Workspace): Promise<void> {
  await setDoc(sharedWorkspaceRef(workspace.id), toSharedWorkspaceDoc(workspace));
}

export async function fetchSharedWorkspace(workspaceId: string): Promise<Workspace | null> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed) return null;
  const snap = await getDoc(sharedWorkspaceRef(trimmed));
  if (!snap.exists()) return null;
  return sharedDocToWorkspace(snap.data() as SharedWorkspaceDoc);
}

export async function deleteSharedWorkspace(workspaceId: string): Promise<void> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed) throw new Error("Workspace invalide.");
  await deleteDoc(sharedWorkspaceRef(trimmed));
}

export async function requestWorkspaceJoin(
  workspaceId: string,
  profile: { uid: string; displayName: string; email: string },
): Promise<void> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed || !profile.uid) {
    throw new Error("Workspace invalide.");
  }
  const shared = await fetchSharedWorkspace(trimmed);
  if (!shared) {
    throw new Error("Ce workspace n'existe pas.");
  }
  if (shared.ownerId === profile.uid) {
    throw new Error("Vous êtes déjà propriétaire de ce workspace.");
  }
  await setDoc(joinRequestRef(trimmed, profile.uid), {
    requesterUid: profile.uid,
    requesterName: profile.displayName.trim() || "Membre",
    requesterEmail: profile.email.trim().toLowerCase(),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function respondWorkspaceJoinRequest(
  workspaceId: string,
  requesterUid: string,
  accept: boolean,
): Promise<void> {
  await updateDoc(joinRequestRef(workspaceId, requesterUid), {
    status: accept ? "accepted" : "declined",
    respondedAt: serverTimestamp(),
  });
}

export async function fetchJoinRequestForUser(
  workspaceId: string,
  uid: string,
): Promise<WorkspaceJoinRequestDoc | null> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed || !uid) return null;
  const snap = await getDoc(joinRequestRef(trimmed, uid));
  if (!snap.exists()) return null;
  return snap.data() as WorkspaceJoinRequestDoc;
}

export async function grantWorkspaceMember(
  workspaceId: string,
  member: { uid: string; displayName: string; email: string },
): Promise<void> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed || !member.uid) return;
  await setDoc(workspaceMemberRef(trimmed, member.uid), {
    uid: member.uid,
    displayName: member.displayName.trim() || "Membre",
    email: member.email.trim().toLowerCase(),
    joinedAt: serverTimestamp(),
  });
}

export function watchPendingJoinRequests(
  workspaceId: string,
  onChange: (requests: WorkspaceJoinRequestDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId) {
    onChange([]);
    return () => {};
  }
  const q = query(joinRequestsCol(workspaceId), where("status", "==", "pending"));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((entry) => entry.data() as WorkspaceJoinRequestDoc));
    },
    onError,
  );
}

export function watchJoinRequestForUser(
  workspaceId: string,
  uid: string,
  onChange: (request: WorkspaceJoinRequestDoc | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId || !uid) {
    onChange(null);
    return () => {};
  }
  return onSnapshot(
    joinRequestRef(workspaceId, uid),
    (snap) => {
      onChange(snap.exists() ? (snap.data() as WorkspaceJoinRequestDoc) : null);
    },
    onError,
  );
}
