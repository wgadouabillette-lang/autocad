import { avatarColor, userInitials, type CallUser } from "./calls";
import { isLegacyMockMemberId, workspaceMembers } from "./workspaceMembers";

export type TheaterRole = "speaker" | "audience" | "question";

export interface TheaterParticipant extends CallUser {
  role: TheaterRole;
}

export interface HandRaiseRequest {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  status: "pending" | "accepted" | "declined";
}

export interface TheaterState {
  workspaceId: string;
  speakers: TheaterParticipant[];
  audience: TheaterParticipant[];
  question: TheaterParticipant | null;
  handRaises: HandRaiseRequest[];
  localRole: TheaterRole | null;
}

const LOCAL_USER: CallUser = { id: "local", name: "Vous", isLocal: true };

const SPEAKER_COUNT = 2;

export function createTheaterState(workspaceId: string): TheaterState {
  const users = workspaceMembers(workspaceId).filter(
    (user) => !isLegacyMockMemberId(user.id),
  );
  const speakers = users.slice(0, SPEAKER_COUNT).map((user) => ({
    ...user,
    role: "speaker" as const,
  }));
  const audience = users.slice(SPEAKER_COUNT).map((user) => ({
    ...user,
    role: "audience" as const,
  }));

  return {
    workspaceId,
    speakers,
    audience,
    question: null,
    handRaises: [],
    localRole: null,
  };
}

/** Réaligne le théâtre sur les membres réels — retire les personnages fictifs obsolètes. */
export function syncTheaterWithMembers(
  workspaceId: string,
  existing?: TheaterState,
): TheaterState {
  const fresh = createTheaterState(workspaceId);
  if (!existing) return fresh;

  const validUserIds = new Set([
    ...fresh.speakers.map((speaker) => speaker.id),
    ...fresh.audience.map((member) => member.id),
    LOCAL_USER.id,
  ]);

  const question =
    existing.question && validUserIds.has(existing.question.id) ? existing.question : null;

  let localRole = existing.localRole;
  if (localRole === "speaker" && fresh.speakers.length === 0) localRole = null;
  if (localRole === "audience" && fresh.audience.length === 0) localRole = null;
  if (localRole === "question" && !question) localRole = null;

  return {
    ...fresh,
    question,
    localRole,
    handRaises: existing.handRaises.filter((request) => validUserIds.has(request.userId)),
  };
}

export function isLocalInTheater(state: TheaterState): boolean {
  return state.localRole !== null;
}

export function canLocalSpeak(state: TheaterState): boolean {
  return state.localRole === "speaker" || state.localRole === "question";
}

export function canLocalRaiseHand(state: TheaterState): boolean {
  return (
    state.localRole === "audience" &&
    !state.handRaises.some((r) => r.userId === LOCAL_USER.id && r.status === "pending")
  );
}

export function localHandRaise(state: TheaterState): HandRaiseRequest | undefined {
  return state.handRaises.find(
    (r) => r.userId === LOCAL_USER.id && r.status === "pending",
  );
}

export function pendingHandRaises(state: TheaterState): HandRaiseRequest[] {
  return state.handRaises.filter((r) => r.status === "pending");
}

export function incomingHandRaise(
  state: TheaterState,
): HandRaiseRequest | undefined {
  if (state.localRole !== "speaker") return undefined;
  return pendingHandRaises(state)[0];
}

export function outgoingHandRaise(
  state: TheaterState,
): HandRaiseRequest | undefined {
  if (state.localRole !== "audience") return undefined;
  return localHandRaise(state);
}

export function stageParticipants(state: TheaterState): TheaterParticipant[] {
  const onStage = [...state.speakers];
  if (state.question) onStage.push(state.question);
  return onStage;
}

/** Nombre de personnes connectées au théâtre (speakers + audience + question). */
export function countTheaterParticipants(state: TheaterState): number {
  let count = state.speakers.length + state.audience.length;
  if (state.question) count += 1;
  return count;
}

export { avatarColor, userInitials, LOCAL_USER };
