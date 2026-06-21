export interface VoicePollOption {
  id: string;
  label: string;
}

export const VOICE_POLL_OPTION_COUNT = 4;

export type VoicePollKind = "regular" | "theater";

export interface VoicePoll {
  id: string;
  workspaceId: string;
  question: string;
  subtitle: string;
  options: VoicePollOption[];
  votesByUserId: Record<string, string>;
  createdByUserId: string;
  createdByName: string;
  status: "open" | "closed";
  createdAt: number;
  expiresAt: number;
  kind?: VoicePollKind;
}

export const VOICE_POLL_TTL_MS = 24 * 60 * 60 * 1000;
export const THEATER_POLL_TTL_MS = 30 * 1000;

export function pollDurationMs(kind?: VoicePollKind): number {
  return kind === "theater" ? THEATER_POLL_TTL_MS : VOICE_POLL_TTL_MS;
}

export function isTheaterPoll(poll: VoicePoll): boolean {
  return poll.kind === "theater";
}

export const VOICE_POLL_MIN_OPTIONS = 2;
export const VOICE_POLL_MAX_OPTIONS = 6;

export function createPollOptionId(): string {
  return `poll-opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function pollVoteCount(poll: VoicePoll, optionId: string): number {
  return Object.values(poll.votesByUserId).filter((vote) => vote === optionId).length;
}

export function pollTotalVotes(poll: VoicePoll): number {
  return Object.keys(poll.votesByUserId).length;
}

export function pollVotePercent(poll: VoicePoll, optionId: string): number {
  const total = pollTotalVotes(poll);
  if (total === 0) return 0;
  return Math.round((pollVoteCount(poll, optionId) / total) * 100);
}

export function localPollVote(poll: VoicePoll, localUserId = "local"): string | null {
  return poll.votesByUserId[localUserId] ?? null;
}

/** Le sondage reste visible pour le créateur ; les autres ne le revoient plus après avoir voté. */
export function shouldShowPollToUser(
  poll: VoicePoll,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (poll.createdByUserId === userId) return true;
  return !poll.votesByUserId[userId];
}

export function pollExpiresAt(
  createdAt: number,
  durationMs: number = VOICE_POLL_TTL_MS,
): number {
  return createdAt + durationMs;
}

export function isPollExpired(poll: VoicePoll, now = Date.now()): boolean {
  return now >= poll.expiresAt;
}

export function pollTimeRemainingMs(poll: VoicePoll, now = Date.now()): number {
  return Math.max(0, poll.expiresAt - now);
}
