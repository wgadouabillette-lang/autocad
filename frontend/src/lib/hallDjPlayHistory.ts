import type { SpotifyTrackCard } from "./connectorsApi";

const STORAGE_KEY = "forma-hall-dj-plays";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface PlayEvent {
  trackId: string;
  playedAt: number;
  track: SpotifyTrackCard;
}

function readEvents(): PlayEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlayEvent[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.trackId === "string" &&
        typeof entry.playedAt === "number" &&
        entry.track &&
        typeof entry.track.name === "string",
    );
  } catch {
    return [];
  }
}

function writeEvents(events: PlayEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function pruneEvents(events: PlayEvent[]): PlayEvent[] {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  return events.filter((entry) => entry.playedAt >= cutoff);
}

export function recordHallDjPlay(track: SpotifyTrackCard) {
  const trackId = track.id?.trim();
  if (!trackId) return;
  const events = pruneEvents(readEvents());
  events.push({ trackId, playedAt: Date.now(), track });
  writeEvents(events.slice(-500));
}

export interface HallDjPopularTrack {
  track: SpotifyTrackCard;
  playCount: number;
  lastPlayedAt: number;
}

export function hallDjPopularTracksLast7Days(limit = 12): HallDjPopularTrack[] {
  const byId = new Map<string, HallDjPopularTrack>();
  for (const entry of pruneEvents(readEvents())) {
    const existing = byId.get(entry.trackId);
    if (existing) {
      existing.playCount += 1;
      existing.lastPlayedAt = Math.max(existing.lastPlayedAt, entry.playedAt);
      continue;
    }
    byId.set(entry.trackId, {
      track: entry.track,
      playCount: 1,
      lastPlayedAt: entry.playedAt,
    });
  }
  return [...byId.values()]
    .sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt)
    .slice(0, limit);
}

export function mergeSpotifyRecentPlays(
  localPopular: HallDjPopularTrack[],
  recent: Array<SpotifyTrackCard & { playedAt?: string }>,
): HallDjPopularTrack[] {
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const byId = new Map<string, HallDjPopularTrack>();
  for (const entry of localPopular) {
    if (entry.track.id) byId.set(entry.track.id, { ...entry });
  }
  for (const track of recent) {
    const trackId = track.id?.trim();
    const playedAtRaw = track.playedAt?.trim();
    if (!trackId || !playedAtRaw) continue;
    const playedAt = Date.parse(playedAtRaw);
    if (!Number.isFinite(playedAt) || playedAt < cutoff) continue;
    const existing = byId.get(trackId);
    if (existing) {
      existing.playCount += 1;
      existing.lastPlayedAt = Math.max(existing.lastPlayedAt, playedAt);
      existing.track = track;
      continue;
    }
    byId.set(trackId, { track, playCount: 1, lastPlayedAt: playedAt });
  }
  return [...byId.values()]
    .sort((a, b) => b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt);
}
