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
  audienceSeatByUserId: Record<string, number>;
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
  const audienceSeatByUserId = Object.fromEntries(
    audience.map((user, index) => [user.id, index]),
  );

  return {
    workspaceId,
    speakers,
    audience,
    audienceSeatByUserId,
    question: null,
    handRaises: [],
    localRole: null,
  };
}

/** Réaligne le théâtre sur les membres réels — conserve le rôle local connecté. */
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

  const withoutLocal = (users: TheaterParticipant[]) =>
    users.filter((user) => !user.isLocal);

  let speakers = withoutLocal(fresh.speakers);
  let audience = withoutLocal(fresh.audience);
  let question =
    existing.question &&
    !existing.question.isLocal &&
    validUserIds.has(existing.question.id)
      ? existing.question
      : null;
  let localRole = existing.localRole;

  if (localRole === "speaker") {
    speakers = [...speakers, { ...LOCAL_USER, role: "speaker" }];
  } else if (localRole === "audience") {
    audience = [...audience, { ...LOCAL_USER, role: "audience" }];
  } else if (localRole === "question") {
    if (existing.question?.isLocal) {
      question = existing.question;
    } else if (!question) {
      localRole = null;
    }
  }

  if (localRole === "speaker" && speakers.length === 0) localRole = null;
  if (localRole === "audience" && audience.length === 0) localRole = null;

  const audienceSeatByUserId = Object.fromEntries(
    Object.entries(existing.audienceSeatByUserId ?? {}).filter(([userId]) =>
      validUserIds.has(userId),
    ),
  );

  return {
    ...fresh,
    speakers,
    audience,
    audienceSeatByUserId,
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

export const THEATER_BENCH_ROW_COUNT = 4;
export const THEATER_BENCH_COLUMN_COUNT = 4;
export const THEATER_BENCH_SEAT_COUNT = 5;
export const THEATER_BENCH_COUNT = THEATER_BENCH_ROW_COUNT * THEATER_BENCH_COLUMN_COUNT;
export const THEATER_AUDIENCE_SEAT_COUNT = THEATER_BENCH_COUNT * THEATER_BENCH_SEAT_COUNT;

/** Mini-preview du block Théâtre (grille 2×2). */
export const THEATER_PREVIEW_BENCH_ROWS = 2;
export const THEATER_PREVIEW_BENCH_COLS = 2;
export const THEATER_PREVIEW_BENCH_COUNT =
  THEATER_PREVIEW_BENCH_ROWS * THEATER_PREVIEW_BENCH_COLS;
export const THEATER_PREVIEW_SPEAKER_SLOTS = 2;

export function firstFreeAudienceSeatIndex(
  seats: Array<TheaterParticipant | null>,
): number | null {
  const index = seats.findIndex((seat) => seat === null);
  return index >= 0 ? index : null;
}

export function buildTheaterAudienceSeats(
  audience: TheaterParticipant[],
  seatByUserId: Record<string, number>,
): Array<TheaterParticipant | null> {
  const seats: Array<TheaterParticipant | null> = Array.from(
    { length: THEATER_AUDIENCE_SEAT_COUNT },
    () => null,
  );
  const placed = new Set<string>();

  for (const participant of audience) {
    const assigned = seatByUserId[participant.id];
    if (
      assigned !== undefined &&
      assigned >= 0 &&
      assigned < seats.length &&
      seats[assigned] === null
    ) {
      seats[assigned] = participant;
      placed.add(participant.id);
    }
  }

  for (const participant of audience) {
    if (placed.has(participant.id)) continue;
    const freeIndex = firstFreeAudienceSeatIndex(seats);
    if (freeIndex === null) break;
    seats[freeIndex] = participant;
  }

  return seats;
}

export function theaterAudienceBenchesFromSeats(
  seats: Array<TheaterParticipant | null>,
): Array<Array<TheaterParticipant | null>> {
  return Array.from({ length: THEATER_BENCH_COUNT }, (_, benchIndex) => {
    const start = benchIndex * THEATER_BENCH_SEAT_COUNT;
    return seats.slice(start, start + THEATER_BENCH_SEAT_COUNT);
  });
}

/** Premiers bancs pour la mini-preview 2×2 du block Théâtre. */
export function theaterPreviewBenches(
  seats: Array<TheaterParticipant | null>,
): Array<Array<TheaterParticipant | null>> {
  return theaterAudienceBenchesFromSeats(seats).slice(0, THEATER_PREVIEW_BENCH_COUNT);
}

export function assignAudienceSeat(
  seatByUserId: Record<string, number>,
  userId: string,
  seatIndex: number,
): Record<string, number> {
  const next = { ...seatByUserId };
  for (const [id, index] of Object.entries(next)) {
    if (index === seatIndex) delete next[id];
  }
  delete next[userId];
  next[userId] = seatIndex;
  return next;
}

export function clearAudienceSeat(
  seatByUserId: Record<string, number>,
  userId: string,
): Record<string, number> {
  const next = { ...seatByUserId };
  delete next[userId];
  return next;
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
