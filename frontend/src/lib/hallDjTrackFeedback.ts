import type { SpotifyTrackCard } from "./connectorsApi";

const STORAGE_KEY = "forma-hall-dj-feedback";
const RECENT_SERVED_KEY = "forma-hall-dj-recent-served";
const MAX_ENTRIES = 400;
const MAX_RECENT_SERVED = 200;
/** After a dislike, do not propose the track again for two weeks. */
const REJECT_BLOCK_MS = 14 * 24 * 60 * 60 * 1000;
/** Avoid replaying the same track too soon across DJ sessions. */
const RECENT_SERVED_MS = 36 * 60 * 60 * 1000;

export type HallDjTrackVerdict = "approve" | "reject";

interface FeedbackEntry {
  trackId: string;
  track: SpotifyTrackCard;
  score: number;
  approveCount: number;
  rejectCount: number;
  lastVerdict: HallDjTrackVerdict;
  updatedAt: number;
}

interface RecentServedEntry {
  trackId: string;
  servedAt: number;
}

function readEntries(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FeedbackEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.trackId === "string" &&
        typeof entry.score === "number" &&
        entry.track &&
        typeof entry.track.name === "string",
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: FeedbackEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

function getEntry(trackId: string): FeedbackEntry | undefined {
  return readEntries().find((entry) => entry.trackId === trackId);
}

function readRecentServed(): RecentServedEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_SERVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentServedEntry[];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - RECENT_SERVED_MS;
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.trackId === "string" &&
        typeof entry.servedAt === "number" &&
        entry.servedAt >= cutoff,
    );
  } catch {
    return [];
  }
}

function writeRecentServed(entries: RecentServedEntry[]) {
  localStorage.setItem(RECENT_SERVED_KEY, JSON.stringify(entries.slice(-MAX_RECENT_SERVED)));
}

export function recordHallDjServedTracks(tracks: SpotifyTrackCard[]): void {
  const now = Date.now();
  const byId = new Map<string, number>();
  for (const entry of readRecentServed()) {
    byId.set(entry.trackId, entry.servedAt);
  }
  for (const track of tracks) {
    const id = track.id?.trim();
    if (!id) continue;
    byId.set(id, now);
  }
  writeRecentServed(
    Array.from(byId.entries()).map(([trackId, servedAt]) => ({ trackId, servedAt })),
  );
}

export function wasHallDjRecentlyServed(trackId: string | undefined): boolean {
  if (!trackId) return false;
  const cutoff = Date.now() - RECENT_SERVED_MS;
  return readRecentServed().some((entry) => entry.trackId === trackId && entry.servedAt >= cutoff);
}

/** Hard exclusion after dislike / strong negative score. */
export function isHallDjTrackBlocked(trackId: string | undefined): boolean {
  if (!trackId) return false;
  const entry = getEntry(trackId);
  if (!entry) return false;
  if (entry.score <= -1 && entry.lastVerdict === "reject") {
    if (Date.now() - entry.updatedAt < REJECT_BLOCK_MS) return true;
  }
  if (entry.score <= -2) return true;
  return false;
}

export function hallDjBlockedTrackIds(): Set<string> {
  const blocked = new Set<string>();
  for (const entry of readEntries()) {
    if (isHallDjTrackBlocked(entry.trackId)) blocked.add(entry.trackId);
  }
  for (const entry of readRecentServed()) {
    blocked.add(entry.trackId);
  }
  return blocked;
}

/** Soft weight for ranking only — blocked tracks should already be filtered out. */
export function hallDjTrackWeight(trackId: string | undefined): number {
  if (!trackId) return 1;
  if (isHallDjTrackBlocked(trackId)) return 0;
  const entry = getEntry(trackId);
  if (!entry || entry.score >= 0) return 1;
  return 0.35;
}

export function hallDjApprovedSeedTracks(limit = 5): SpotifyTrackCard[] {
  return readEntries()
    .filter((entry) => entry.score >= 1 && !isHallDjTrackBlocked(entry.trackId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((entry) => entry.track);
}

export function recordHallDjTrackFeedback(
  track: SpotifyTrackCard,
  verdict: HallDjTrackVerdict,
): void {
  const trackId = track.id?.trim();
  if (!trackId) return;

  const entries = readEntries();
  const index = entries.findIndex((entry) => entry.trackId === trackId);
  const existing = index >= 0 ? entries[index]! : null;
  const delta = verdict === "approve" ? 1 : -1;
  const nextScore = Math.max(-3, Math.min(5, (existing?.score ?? 0) + delta));

  const next: FeedbackEntry = {
    trackId,
    track,
    score: nextScore,
    approveCount: (existing?.approveCount ?? 0) + (verdict === "approve" ? 1 : 0),
    rejectCount: (existing?.rejectCount ?? 0) + (verdict === "reject" ? 1 : 0),
    lastVerdict: verdict,
    updatedAt: Date.now(),
  };

  if (index >= 0) entries[index] = next;
  else entries.push(next);
  writeEntries(entries);

  if (verdict === "reject") {
    recordHallDjServedTracks([track]);
  }
}

export function sortTracksByDjFeedback(tracks: SpotifyTrackCard[]): SpotifyTrackCard[] {
  return [...tracks].sort((a, b) => {
    const weightDiff = hallDjTrackWeight(b.id) - hallDjTrackWeight(a.id);
    if (weightDiff !== 0) return weightDiff;
    return Math.random() - 0.5;
  });
}

/** Drop blocked / recently served tracks. Never reintroduce them as a fallback. */
export function filterTracksByDjFeedback(tracks: SpotifyTrackCard[]): SpotifyTrackCard[] {
  return tracks.filter((track) => {
    const id = track.id?.trim();
    if (!id) return true;
    if (isHallDjTrackBlocked(id)) return false;
    if (wasHallDjRecentlyServed(id)) return false;
    return Math.random() < hallDjTrackWeight(id);
  });
}
