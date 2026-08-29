import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import type { ChatSession } from "../../store/useStore";
import type { UserPreferences } from "../userPreferences";
import type { ServerMembership, Workspace } from "../workspaces";
import { db } from "./client";

export interface UserProfileDoc extends UserPreferences {
  email: string;
  photoURL?: string;
  aiModel?: string;
  billingManaged?: boolean;
  subscriptionTier?: string;
  workspaceSetupCompleted?: boolean;
  dashboardOnboardingCompleted?: boolean;
  updatedAt?: unknown;
}

export interface UserDirectoryDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  updatedAt?: unknown;
}

export interface CloudFriendRequestDoc {
  id: string;
  fromUid: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  toUid?: string | null;
  status: "pending" | "accepted" | "declined";
  createdAt?: unknown;
  respondedAt?: unknown;
}

export type { ChatSession };

function profileRef(uid: string) {
  return doc(db, "users", uid);
}

function userDirectoryRef(uid: string) {
  return doc(db, "userDirectory", uid);
}

function userDirectoryCol() {
  return collection(db, "userDirectory");
}

function workspacesCol(uid: string) {
  return collection(db, "users", uid, "workspaces");
}

function membershipsCol(uid: string) {
  return collection(db, "users", uid, "memberships");
}

function chatSessionsCol(uid: string) {
  return collection(db, "users", uid, "chatSessions");
}

function projectsCol(uid: string) {
  return collection(db, "users", uid, "projects");
}

function friendRequestsCol() {
  return collection(db, "friendRequests");
}

export async function loadUserProfile(uid: string): Promise<UserProfileDoc | null> {
  const snap = await getDoc(profileRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfileDoc;
}

export function watchUserProfile(
  uid: string,
  onChange: (profile: UserProfileDoc | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!uid) {
    onChange(null);
    return () => {};
  }

  // Ref-counted: plusieurs hooks billing partagent un seul onSnapshot.
  type Entry = {
    unsub: Unsubscribe;
    callbacks: Set<{
      onChange: (profile: UserProfileDoc | null) => void;
      onError?: (error: Error) => void;
    }>;
    last: UserProfileDoc | null;
    hasValue: boolean;
  };

  const globalKey = "__hallUserProfileLive";
  const root = globalThis as typeof globalThis & {
    [globalKey]?: Map<string, Entry>;
  };
  if (!root[globalKey]) root[globalKey] = new Map();
  const live = root[globalKey]!;

  let entry = live.get(uid);
  const callback = { onChange, onError };

  if (!entry) {
    entry = {
      unsub: () => {},
      callbacks: new Set(),
      last: null,
      hasValue: false,
    };
    live.set(uid, entry);
    entry.unsub = onSnapshot(
      profileRef(uid),
      (snap) => {
        const current = live.get(uid);
        if (!current) return;
        const data = snap.exists() ? (snap.data() as UserProfileDoc) : null;
        current.last = data;
        current.hasValue = true;
        for (const cb of current.callbacks) cb.onChange(data);
      },
      (error) => {
        const current = live.get(uid);
        if (!current) return;
        for (const cb of current.callbacks) cb.onError?.(error);
      },
    );
  } else if (entry.hasValue) {
    onChange(entry.last);
  }

  entry.callbacks.add(callback);

  return () => {
    const current = live.get(uid);
    if (!current) return;
    current.callbacks.delete(callback);
    if (current.callbacks.size > 0) return;
    current.unsub();
    live.delete(uid);
  };
}

export async function saveUserProfile(uid: string, profile: UserProfileDoc): Promise<void> {
  await setDoc(
    profileRef(uid),
    {
      ...profile,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveUserDirectoryProfile(
  uid: string,
  profile: UserProfileDoc,
): Promise<void> {
  const email = profile.email.trim().toLowerCase();
  if (!email) return;
  await setDoc(
    userDirectoryRef(uid),
    {
      uid,
      email,
      displayName: profile.userDisplayName.trim() || email.split("@")[0],
      photoURL: profile.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadUserDirectoryByUid(uid: string): Promise<UserDirectoryDoc | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;
  const snap = await getDoc(userDirectoryRef(trimmed));
  if (!snap.exists()) return null;
  return snap.data() as UserDirectoryDoc;
}

export async function findUserDirectoryByEmail(
  email: string,
): Promise<UserDirectoryDoc | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const snap = await getDocs(
    query(userDirectoryCol(), where("email", "==", normalized), limit(1)),
  );
  const first = snap.docs[0];
  if (!first) return null;
  return first.data() as UserDirectoryDoc;
}

export async function createFriendRequest(input: {
  fromUid: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  toUid?: string | null;
}): Promise<CloudFriendRequestDoc> {
  const ref = doc(friendRequestsCol());
  const payload = {
    id: ref.id,
    fromUid: input.fromUid,
    fromName: input.fromName.trim() || input.fromEmail.split("@")[0],
    fromEmail: input.fromEmail.trim().toLowerCase(),
    toEmail: input.toEmail.trim().toLowerCase(),
    toUid: input.toUid ?? null,
    status: "pending" as const,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  return payload;
}

export function watchIncomingFriendRequests(
  email: string,
  onChange: (requests: CloudFriendRequestDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(
      friendRequestsCol(),
      where("toEmail", "==", normalized),
      where("status", "==", "pending"),
    ),
    (snap) => {
      onChange(
        snap.docs.map((docSnap) => ({
          ...(docSnap.data() as Omit<CloudFriendRequestDoc, "id">),
          id: docSnap.id,
        })),
      );
    },
    onError,
  );
}

export async function loadIncomingFriendRequests(
  email: string,
): Promise<CloudFriendRequestDoc[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const snap = await getDocs(
    query(
      friendRequestsCol(),
      where("toEmail", "==", normalized),
      where("status", "==", "pending"),
    ),
  );
  return snap.docs.map((docSnap) => ({
    ...(docSnap.data() as Omit<CloudFriendRequestDoc, "id">),
    id: docSnap.id,
  }));
}

export async function respondToFriendRequest(
  requestId: string,
  status: "accepted" | "declined",
  responderUid: string,
): Promise<void> {
  await updateDoc(doc(friendRequestsCol(), requestId), {
    status,
    respondedAt: serverTimestamp(),
    toUid: responderUid,
  });
}

export function watchOutgoingFriendRequests(
  uid: string,
  onChange: (requests: CloudFriendRequestDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!uid) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    query(friendRequestsCol(), where("fromUid", "==", uid)),
    (snap) => {
      onChange(
        snap.docs.map((docSnap) => ({
          ...(docSnap.data() as Omit<CloudFriendRequestDoc, "id">),
          id: docSnap.id,
        })),
      );
    },
    onError,
  );
}

export async function loadUserWorkspaces(uid: string): Promise<{
  customServers: Workspace[];
  memberships: ServerMembership[];
}> {
  const [workspaceSnap, membershipSnap] = await Promise.all([
    getDocs(workspacesCol(uid)),
    getDocs(membershipsCol(uid)),
  ]);
  return {
    customServers: workspaceSnap.docs.map((d) => d.data() as Workspace),
    memberships: membershipSnap.docs.map((d) => d.data() as ServerMembership),
  };
}

function firestoreWorkspaceDoc(server: Workspace): DocumentData {
  const docData: DocumentData = {
    id: server.id,
    name: server.name,
    accent: server.accent,
    ownerId: server.ownerId,
    ownerName: server.ownerName,
    createdAt: server.createdAt,
  };
  if (server.iconURL) docData.iconURL = server.iconURL;
  return docData;
}

function asComparableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function workspaceDocsEqual(existing: DocumentData, desired: DocumentData): boolean {
  return (
    asComparableJson(existing.id) === asComparableJson(desired.id) &&
    asComparableJson(existing.name) === asComparableJson(desired.name) &&
    asComparableJson(existing.accent) === asComparableJson(desired.accent) &&
    asComparableJson(existing.ownerId) === asComparableJson(desired.ownerId) &&
    asComparableJson(existing.ownerName) === asComparableJson(desired.ownerName) &&
    asComparableJson(existing.createdAt) === asComparableJson(desired.createdAt) &&
    asComparableJson(existing.iconURL ?? null) === asComparableJson(desired.iconURL ?? null)
  );
}

function membershipDocsEqual(existing: DocumentData, desired: ServerMembership): boolean {
  return (
    asComparableJson(existing.userId) === asComparableJson(desired.userId) &&
    asComparableJson(existing.workspaceId) === asComparableJson(desired.workspaceId) &&
    asComparableJson(existing.role) === asComparableJson(desired.role) &&
    asComparableJson(existing.joinedAt) === asComparableJson(desired.joinedAt)
  );
}

/**
 * Sync différentiel — pas de delete-all/rewrite.
 * Ne touche que les docs ajoutés, modifiés ou vraiment absents localement.
 */
export async function saveUserWorkspaces(
  uid: string,
  data: { customServers: Workspace[]; memberships: ServerMembership[] },
): Promise<void> {
  const desiredWorkspaces = new Map(
    data.customServers.map((server) => [server.id, firestoreWorkspaceDoc(server)] as const),
  );
  const desiredMemberships = new Map(
    data.memberships.map((membership) => {
      const id = `${membership.userId}:${membership.workspaceId}`;
      return [id, membership] as const;
    }),
  );

  const [workspaceSnap, membershipSnap] = await Promise.all([
    getDocs(workspacesCol(uid)),
    getDocs(membershipsCol(uid)),
  ]);

  const batch = writeBatch(db);
  let ops = 0;

  for (const existing of workspaceSnap.docs) {
    const desired = desiredWorkspaces.get(existing.id);
    if (!desired) {
      batch.delete(existing.ref);
      ops += 1;
      continue;
    }
    if (!workspaceDocsEqual(existing.data(), desired)) {
      batch.set(existing.ref, desired);
      ops += 1;
    }
    desiredWorkspaces.delete(existing.id);
  }
  for (const [id, desired] of desiredWorkspaces) {
    batch.set(doc(workspacesCol(uid), id), desired);
    ops += 1;
  }

  for (const existing of membershipSnap.docs) {
    const desired = desiredMemberships.get(existing.id);
    if (!desired) {
      batch.delete(existing.ref);
      ops += 1;
      continue;
    }
    if (!membershipDocsEqual(existing.data(), desired)) {
      batch.set(existing.ref, desired as DocumentData);
      ops += 1;
    }
    desiredMemberships.delete(existing.id);
  }
  for (const [id, desired] of desiredMemberships) {
    batch.set(doc(membershipsCol(uid), id), desired as DocumentData);
    ops += 1;
  }

  if (ops === 0) return;
  await batch.commit();
}

export async function saveChatSessions(uid: string, sessions: ChatSession[]): Promise<void> {
  const batch = writeBatch(db);
  const existing = await getDocs(chatSessionsCol(uid));
  for (const docSnap of existing.docs) {
    batch.delete(docSnap.ref);
  }
  for (const session of sessions) {
    batch.set(doc(chatSessionsCol(uid), session.id), session as unknown as DocumentData);
  }
  await batch.commit();
}

export async function saveChatSession(uid: string, session: ChatSession): Promise<void> {
  await setDoc(
    doc(chatSessionsCol(uid), session.id),
    session as unknown as DocumentData,
  );
}

export async function deleteChatSession(uid: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(chatSessionsCol(uid), sessionId));
}

export async function loadChatSessions(uid: string): Promise<ChatSession[]> {
  const snap = await getDocs(chatSessionsCol(uid));
  return snap.docs.map((d) => d.data() as ChatSession);
}

export function toChatSessionSummary(session: ChatSession): ChatSession {
  return {
    id: session.id,
    title: session.title,
    messages: [],
    updatedAt: session.updatedAt,
    kind: session.kind,
    recordingId: session.recordingId,
    durationMs: session.durationMs,
  };
}

/** Liste légère pour l'historique — sans messages ni corps de note. */
export async function loadChatSessionSummaries(uid: string): Promise<ChatSession[]> {
  const snap = await getDocs(chatSessionsCol(uid));
  return snap.docs.map((d) => toChatSessionSummary(d.data() as ChatSession));
}

export async function loadChatSessionById(
  uid: string,
  sessionId: string,
): Promise<ChatSession | null> {
  const snap = await getDoc(doc(chatSessionsCol(uid), sessionId));
  if (!snap.exists()) return null;
  return snap.data() as ChatSession;
}

export interface IncomingWorkspaceInviteDoc {
  workspaceId: string;
  workspaceName: string;
  invitedByUid: string;
  invitedByName: string;
  status: "pending";
  createdAt?: unknown;
}

function incomingWorkspaceInvitesCol(uid: string) {
  return collection(db, "users", uid, "incomingWorkspaceInvites");
}

function incomingWorkspaceInviteRef(uid: string, workspaceId: string) {
  return doc(incomingWorkspaceInvitesCol(uid), workspaceId.trim().toLowerCase());
}

export async function createIncomingWorkspaceInvite(
  toUid: string,
  invite: Omit<IncomingWorkspaceInviteDoc, "createdAt" | "status">,
): Promise<void> {
  const workspaceId = invite.workspaceId.trim().toLowerCase();
  if (!toUid.trim() || !workspaceId) return;
  await setDoc(incomingWorkspaceInviteRef(toUid, workspaceId), {
    workspaceId,
    workspaceName: invite.workspaceName.trim() || "Workspace",
    invitedByUid: invite.invitedByUid,
    invitedByName: invite.invitedByName.trim() || "Membre",
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function fetchIncomingWorkspaceInvite(
  uid: string,
  workspaceId: string,
): Promise<IncomingWorkspaceInviteDoc | null> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!uid.trim() || !trimmed) return null;
  const snap = await getDoc(incomingWorkspaceInviteRef(uid, trimmed));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<IncomingWorkspaceInviteDoc>;
  return {
    workspaceId: data.workspaceId?.trim().toLowerCase() || snap.id,
    workspaceName: data.workspaceName?.trim() || "Workspace",
    invitedByUid: data.invitedByUid?.trim() || "",
    invitedByName: data.invitedByName?.trim() || "Membre",
    status: "pending",
    createdAt: data.createdAt,
  };
}

export function watchIncomingWorkspaceInvites(
  uid: string,
  onChange: (invites: IncomingWorkspaceInviteDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!uid.trim()) {
    onChange([]);
    return () => {};
  }
  return onSnapshot(
    incomingWorkspaceInvitesCol(uid),
    (snap) => {
      onChange(
        snap.docs.map((entry) => {
          const data = entry.data() as Partial<IncomingWorkspaceInviteDoc>;
          return {
            workspaceId: data.workspaceId?.trim().toLowerCase() || entry.id,
            workspaceName: data.workspaceName?.trim() || "Workspace",
            invitedByUid: data.invitedByUid?.trim() || "",
            invitedByName: data.invitedByName?.trim() || "Membre",
            status: "pending",
            createdAt: data.createdAt,
          };
        }),
      );
    },
    onError,
  );
}

export async function deleteIncomingWorkspaceInvite(
  uid: string,
  workspaceId: string,
): Promise<void> {
  const trimmed = workspaceId.trim().toLowerCase();
  if (!uid.trim() || !trimmed) return;
  await deleteDoc(incomingWorkspaceInviteRef(uid, trimmed));
}

export async function saveProjectSnapshot(
  uid: string,
  projectId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await setDoc(doc(projectsCol(uid), projectId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export async function loadLatestProjectSnapshot(
  uid: string,
): Promise<Record<string, unknown> | null> {
  const snap = await getDocs(projectsCol(uid));
  if (snap.empty) return null;
  const sorted = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    .sort((a, b) => {
      const aTs = typeof a.data.updatedAt === "object" ? 1 : 0;
      const bTs = typeof b.data.updatedAt === "object" ? 1 : 0;
      return bTs - aTs;
    });
  return sorted[0]?.data ?? null;
}
