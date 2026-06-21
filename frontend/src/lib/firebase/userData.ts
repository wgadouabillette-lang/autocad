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
  return onSnapshot(
    profileRef(uid),
    (snap) => {
      onChange(snap.exists() ? (snap.data() as UserProfileDoc) : null);
    },
    onError,
  );
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
  const doc: DocumentData = {
    id: server.id,
    name: server.name,
    accent: server.accent,
    ownerId: server.ownerId,
    ownerName: server.ownerName,
    createdAt: server.createdAt,
  };
  if (server.iconURL) doc.iconURL = server.iconURL;
  return doc;
}

export async function saveUserWorkspaces(
  uid: string,
  data: { customServers: Workspace[]; memberships: ServerMembership[] },
): Promise<void> {
  const batch = writeBatch(db);
  const workspaceSnap = await getDocs(workspacesCol(uid));
  for (const existing of workspaceSnap.docs) {
    batch.delete(existing.ref);
  }
  for (const server of data.customServers) {
    batch.set(doc(workspacesCol(uid), server.id), firestoreWorkspaceDoc(server));
  }

  const membershipSnap = await getDocs(membershipsCol(uid));
  for (const existing of membershipSnap.docs) {
    batch.delete(existing.ref);
  }
  for (const membership of data.memberships) {
    const id = `${membership.userId}:${membership.workspaceId}`;
    batch.set(doc(membershipsCol(uid), id), membership as DocumentData);
  }
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
