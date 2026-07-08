import type { SpotifyTrackCard } from "./connectorsApi";

const STORAGE_KEY = "forma-hall-dj-feedback";
const MAX_ENTRIES = 400;

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

/** Lower weight = proposed less often (never fully excluded). */
export function hallDjTrackWeight(trackId: string | undefined): number {
  if (!trackId) return 1;
  const entry = getEntry(trackId);
  if (!entry || entry.score >= 0) return 1;
  if (entry.score <= -2) return 0.22;
  return 0.48;
}

export function hallDjApprovedSeedTracks(limit = 5): SpotifyTrackCard[] {
  return readEntries()
    .filter((entry) => entry.score >= 1)
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
}

export function sortTracksByDjFeedback(tracks: SpotifyTrackCard[]): SpotifyTrackCard[] {
  return [...tracks].sort((a, b) => {
    const weightDiff = hallDjTrackWeight(b.id) - hallDjTrackWeight(a.id);
    if (weightDiff !== 0) return weightDiff;
    return Math.random() - 0.5;
  });
}

export function filterTracksByDjFeedback(tracks: SpotifyTrackCard[]): SpotifyTrackCard[] {
  const kept = tracks.filter((track) => Math.random() < hallDjTrackWeight(track.id));
  return kept.length > 0 ? kept : tracks.slice(0, Math.max(1, Math.ceil(tracks.length / 3)));
}
