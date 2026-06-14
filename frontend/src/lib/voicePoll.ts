export interface VoicePollOption {
  id: string;
  label: string;
}

export const VOICE_POLL_OPTION_COUNT = 4;

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
}

export const VOICE_POLL_TTL_MS = 24 * 60 * 60 * 1000;

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

export function pollExpiresAt(createdAt: number): number {
  return createdAt + VOICE_POLL_TTL_MS;
}

export function isPollExpired(poll: VoicePoll, now = Date.now()): boolean {
  return now >= poll.expiresAt;
}

export function pollTimeRemainingMs(poll: VoicePoll, now = Date.now()): number {
  return Math.max(0, poll.expiresAt - now);
}
