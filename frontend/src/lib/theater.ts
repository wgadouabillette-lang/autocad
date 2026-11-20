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

export interface TheaterPresenceMember {
  id: string;
  name: string;
  photoURL?: string;
  inTheaterCall?: boolean;
  theaterRole?: TheaterRole | null;
}

function keepRemote(users: TheaterParticipant[]): TheaterParticipant[] {
  return users.filter((user) => !user.isLocal && !isLegacyMockMemberId(user.id));
}

function placeLocal(
  speakers: TheaterParticipant[],
  audience: TheaterParticipant[],
  question: TheaterParticipant | null,
  existing: TheaterState | undefined,
): {
  speakers: TheaterParticipant[];
  audience: TheaterParticipant[];
  question: TheaterParticipant | null;
  localRole: TheaterRole | null;
} {
  let localRole = existing?.localRole ?? null;
  if (localRole === "speaker") {
    speakers = [...speakers, { ...LOCAL_USER, role: "speaker" }];
  } else if (localRole === "audience") {
    audience = [...audience, { ...LOCAL_USER, role: "audience" }];
  } else if (localRole === "question") {
    question = existing?.question?.isLocal
      ? existing.question
      : { ...LOCAL_USER, role: "question" };
  }
  return { speakers, audience, question, localRole };
}

function seatsForAudience(
  audience: TheaterParticipant[],
  previous: Record<string, number>,
): Record<string, number> {
  const ids = new Set(audience.map((participant) => participant.id));
  let seats = Object.fromEntries(
    Object.entries(previous).filter(([userId]) => ids.has(userId)),
  );
  for (const participant of audience) {
    if (seats[participant.id] !== undefined) continue;
    const placed = buildTheaterAudienceSeats(audience, seats);
    const freeIndex = firstFreeAudienceSeatIndex(placed);
    if (freeIndex === null) break;
    seats = assignAudienceSeat(seats, participant.id, freeIndex);
  }
  return seats;
}

/** Réaligne le théâtre sans effacer les personnes déjà vues via la présence. */
export function syncTheaterWithMembers(
  workspaceId: string,
  existing?: TheaterState,
): TheaterState {
  if (!existing) return createTheaterState(workspaceId);

  const placed = placeLocal(
    keepRemote(existing.speakers),
    keepRemote(existing.audience),
    existing.question && !existing.question.isLocal && !isLegacyMockMemberId(existing.question.id)
      ? existing.question
      : null,
    existing,
  );
  const validUserIds = new Set([
    ...placed.speakers.map((speaker) => speaker.id),
    ...placed.audience.map((member) => member.id),
    ...(placed.question ? [placed.question.id] : []),
    LOCAL_USER.id,
  ]);

  return {
    ...existing,
    workspaceId,
    speakers: placed.speakers,
    audience: placed.audience,
    question: placed.question,
    localRole: placed.localRole,
    audienceSeatByUserId: seatsForAudience(
      placed.audience,
      existing.audienceSeatByUserId ?? {},
    ),
    handRaises: existing.handRaises.filter((request) => validUserIds.has(request.userId)),
  };
}

/**
 * Les autres personnes du théâtre viennent de la présence, comme les salons vocaux.
 * Le rôle local reste celui de cet appareil.
 */
export function syncTheaterFromPresence(
  existing: TheaterState | undefined,
  workspaceId: string,
  members: TheaterPresenceMember[],
  localFirebaseUid?: string | null,
): TheaterState {
  const speakers: TheaterParticipant[] = [];
  const audience: TheaterParticipant[] = [];
  let question: TheaterParticipant | null = null;

  for (const member of members) {
    if (!member.id || member.id === "local" || member.id === localFirebaseUid) continue;
    if (!member.inTheaterCall) continue;
    const role: TheaterRole =
      member.theaterRole === "speaker" ||
      member.theaterRole === "question" ||
      member.theaterRole === "audience"
        ? member.theaterRole
        : "audience";
    const participant: TheaterParticipant = {
      id: member.id,
      name: member.name.trim() || "Membre",
      photoURL: member.photoURL,
      role,
    };
    if (role === "speaker") speakers.push(participant);
    else if (role === "question") {
      if (!question) question = participant;
    } else audience.push(participant);
  }

  const placed = placeLocal(speakers, audience, question, existing);
  return {
    workspaceId,
    speakers: placed.speakers,
    audience: placed.audience,
    question: placed.question,
    localRole: placed.localRole,
    audienceSeatByUserId: seatsForAudience(
      placed.audience,
      existing?.audienceSeatByUserId ?? {},
    ),
    handRaises: existing?.handRaises ?? [],
  };
}

export function theaterRosterSignature(state: TheaterState | undefined): string {
  if (!state) return "";
  const people = (list: TheaterParticipant[]) =>
    list.map((person) => `${person.id}:${person.role}:${person.name}`).join(",");
  const seats = Object.entries(state.audienceSeatByUserId ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, seat]) => `${id}=${seat}`)
    .join(",");
  return [
    state.localRole ?? "",
    people(state.speakers),
    people(state.audience),
    state.question ? `${state.question.id}:${state.question.role}` : "",
    seats,
    state.handRaises.map((request) => `${request.id}:${request.status}`).join(","),
  ].join("|");
}

export function isLocalInTheater(state: TheaterState): boolean {
  return state.localRole !== null;
}

export function canLocalSpeak(state: TheaterState): boolean {
  return state.localRole === "speaker" || state.localRole === "question";
}

/** Presence / tiles use the Firebase uid; local call state still uses `"local"`. */
export function isLocalHandRaiseUserId(
  userId: string,
  firebaseUid?: string | null,
): boolean {
  return userId === LOCAL_USER.id || (!!firebaseUid && userId === firebaseUid);
}

export function pendingLocalHandRaise(
  handRaises: HandRaiseRequest[],
  firebaseUid?: string | null,
): HandRaiseRequest | undefined {
  return handRaises.find(
    (request) =>
      request.status === "pending" &&
      isLocalHandRaiseUserId(request.userId, firebaseUid),
  );
}

export function canLocalRaiseHand(
  state: TheaterState,
  firebaseUid?: string | null,
): boolean {
  return (
    state.localRole === "audience" &&
    !pendingLocalHandRaise(state.handRaises, firebaseUid)
  );
}

export function localHandRaise(
  state: TheaterState,
  firebaseUid?: string | null,
): HandRaiseRequest | undefined {
  return pendingLocalHandRaise(state.handRaises, firebaseUid);
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
