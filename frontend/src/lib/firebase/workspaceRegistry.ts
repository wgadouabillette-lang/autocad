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

function normalizeSharedWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

function sharedWorkspaceRef(workspaceId: string) {
  return doc(db, "workspacesShared", normalizeSharedWorkspaceId(workspaceId));
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

function workspaceMembersCol(workspaceId: string) {
  return collection(db, "workspacesShared", workspaceId, "members");
}

export interface WorkspaceMemberDoc {
  uid: string;
  displayName: string;
  email: string;
  joinedAt?: unknown;
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
  return watchSharedWorkspaceDoc(
    workspaceId,
    (data) => {
      onChange(data ? sharedDocToWorkspace(data) : null);
    },
    onError,
  );
}

/**
 * Ref-counted live subscription to workspacesShared/{id}.
 * Multiple callers share one onSnapshot (presence + join settings + enterprise + boosted).
 */
export function watchSharedWorkspaceDoc(
  workspaceId: string,
  onChange: (data: SharedWorkspaceDoc | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const trimmed = normalizeSharedWorkspaceId(workspaceId);
  if (!trimmed) {
    onChange(null);
    return () => {};
  }

  type Entry = {
    unsub: Unsubscribe;
    callbacks: Set<{
      onChange: (data: SharedWorkspaceDoc | null) => void;
      onError?: (error: Error) => void;
    }>;
    last: SharedWorkspaceDoc | null;
    hasValue: boolean;
  };

  const globalKey = "__hallSharedWorkspaceLive";
  const root = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, Entry>;
  };
  if (!root[globalKey]) root[globalKey] = new Map();
  const live = root[globalKey]!;

  let entry = live.get(trimmed);
  const callback = { onChange, onError };

  if (!entry) {
    entry = {
      unsub: () => {},
      callbacks: new Set(),
      last: null,
      hasValue: false,
    };
    live.set(trimmed, entry);
    entry.unsub = onSnapshot(
      sharedWorkspaceRef(trimmed),
      (snap) => {
        const current = live.get(trimmed);
        if (!current) return;
        const data = snap.exists()
          ? ({ id: trimmed, ...(snap.data() as object) } as SharedWorkspaceDoc)
          : null;
        current.last = data;
        current.hasValue = true;
        for (const cb of current.callbacks) cb.onChange(data);
      },
      (error) => {
        const current = live.get(trimmed);
        if (!current) return;
        for (const cb of current.callbacks) cb.onError?.(error);
      },
    );
  } else if (entry.hasValue) {
    onChange(entry.last);
  }

  entry.callbacks.add(callback);

  return () => {
    const current = live.get(trimmed);
    if (!current) return;
    current.callbacks.delete(callback);
    if (current.callbacks.size > 0) return;
    current.unsub();
    live.delete(trimmed);
  };
}

function sharedWorkspaceNeedsWrite(
  existing: SharedWorkspaceDoc | null,
  next: SharedWorkspaceDoc,
): boolean {
  if (!existing) return true;
  return (
    existing.name !== next.name ||
    existing.accent !== next.accent ||
    (existing.iconURL ?? null) !== (next.iconURL ?? null) ||
    existing.ownerId !== next.ownerId ||
    existing.ownerName !== next.ownerName ||
    existing.createdAt !== next.createdAt ||
    (existing.membersCanInvite !== false) !== (next.membersCanInvite !== false)
  );
}

export async function publishSharedWorkspace(workspace: Workspace): Promise<void> {
  const id = normalizeSharedWorkspaceId(workspace.id);
  if (!id) throw new Error("Workspace invalide.");
  const next = toSharedWorkspaceDoc({ ...workspace, id });
  const ref = sharedWorkspaceRef(id);
  const snap = await getDoc(ref);
  const existing = snap.exists()
    ? ({ id, ...(snap.data() as object) } as SharedWorkspaceDoc)
    : null;

  if (sharedWorkspaceNeedsWrite(existing, next)) {
    await setDoc(ref, next, { merge: true });
  }

  // Owner must appear in members so invitees can list the full roster.
  if (workspace.ownerId) {
    await grantWorkspaceMember(id, {
      uid: workspace.ownerId,
      displayName: workspace.ownerName.trim() || "Membre",
      email: "",
    });
  }
}

/** Garantit que workspacesShared existe avec le bon propriétaire (requis pour Storage). */
export async function ensureSharedWorkspacePublished(
  workspace: Workspace,
  firebaseUid: string,
): Promise<void> {
  const id = normalizeSharedWorkspaceId(workspace.id);
  if (!id || !firebaseUid) {
    throw new Error("Workspace invalide.");
  }

  const payload: Workspace = {
    ...workspace,
    id,
    ownerId: firebaseUid,
  };

  const existing = await fetchSharedWorkspace(id);
  if (existing && existing.ownerId !== firebaseUid) {
    throw new Error(
      "Ce workspace n'est pas enregistré avec votre compte. Réessayez après vous être reconnecté.",
    );
  }

  const next = toSharedWorkspaceDoc(payload);
  if (!sharedWorkspaceNeedsWrite(existing as SharedWorkspaceDoc | null, next)) {
    if (payload.ownerId) {
      await grantWorkspaceMember(id, {
        uid: payload.ownerId,
        displayName: payload.ownerName.trim() || "Membre",
        email: "",
      });
    }
    return;
  }

  await setDoc(sharedWorkspaceRef(id), next, { merge: true });
  if (payload.ownerId) {
    await grantWorkspaceMember(id, {
      uid: payload.ownerId,
      displayName: payload.ownerName.trim() || "Membre",
      email: "",
    });
  }
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
  const displayName = member.displayName.trim() || "Membre";
  const email = member.email.trim().toLowerCase();
  const ref = workspaceMemberRef(trimmed, member.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as Partial<WorkspaceMemberDoc>;
    const sameName = (data.displayName?.trim() || "Membre") === displayName;
    const sameEmail = (typeof data.email === "string" ? data.email : "") === email;
    const sameUid = (data.uid?.trim() || snap.id) === member.uid;
    if (sameName && sameEmail && sameUid) return;
    // Ne pas retoucher joinedAt — ça facturait un write à chaque publish.
    await setDoc(ref, { uid: member.uid, displayName, email }, { merge: true });
    return;
  }
  await setDoc(
    ref,
    {
      uid: member.uid,
      displayName,
      email,
      joinedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchWorkspaceMember(
  workspaceId: string,
  memberUid: string,
): Promise<WorkspaceMemberDoc | null> {
  const trimmed = workspaceId.trim().toLowerCase();
  const uid = memberUid.trim();
  if (!trimmed || !uid) return null;
  const snap = await getDoc(workspaceMemberRef(trimmed, uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<WorkspaceMemberDoc>;
  return {
    uid: data.uid?.trim() || snap.id,
    displayName: data.displayName?.trim() || "Membre",
    email: typeof data.email === "string" ? data.email : "",
    joinedAt: data.joinedAt,
  };
}

export function watchWorkspaceMembers(
  workspaceId: string,
  onChange: (members: WorkspaceMemberDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!trimmed) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    workspaceMembersCol(trimmed),
    (snap) => {
      onChange(
        snap.docs.map((entry) => {
          const data = entry.data() as Partial<WorkspaceMemberDoc>;
          return {
            uid: data.uid?.trim() || entry.id,
            displayName: data.displayName?.trim() || "Membre",
            email: typeof data.email === "string" ? data.email : "",
            joinedAt: data.joinedAt,
          };
        }),
      );
    },
    onError,
  );
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
