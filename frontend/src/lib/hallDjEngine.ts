import {
  fetchSpotifyRecentlyPlayed,
  fetchSpotifyRecommendations,
  searchSpotifyTracks,
  type SpotifyTrackCard,
} from "./connectorsApi";
import { DEFAULT_HALL_DJ_GENRE } from "./hallDjGenres";
import {
  hallDjPopularTracksLast7Days,
  mergeSpotifyRecentPlays,
  type HallDjPopularTrack,
} from "./hallDjPlayHistory";

const BATCH_SIZE = 12;

function trackKey(track: SpotifyTrackCard): string {
  return track.id ?? `${track.name}::${track.artists}`;
}

function dedupeTracks(tracks: SpotifyTrackCard[], exclude = new Set<string>()): SpotifyTrackCard[] {
  const seen = new Set<string>(exclude);
  const out: SpotifyTrackCard[] = [];
  for (const track of tracks) {
    const key = trackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(track);
  }
  return out;
}

function interleave(replays: SpotifyTrackCard[], discoveries: SpotifyTrackCard[]): SpotifyTrackCard[] {
  const out: SpotifyTrackCard[] = [];
  let replayIndex = 0;
  let discoveryIndex = 0;
  while (
    out.length < BATCH_SIZE &&
    (replayIndex < replays.length || discoveryIndex < discoveries.length)
  ) {
    if (replayIndex < replays.length) {
      out.push(replays[replayIndex]!);
      replayIndex += 1;
    }
    if (out.length >= BATCH_SIZE) break;
    if (discoveryIndex < discoveries.length) {
      out.push(discoveries[discoveryIndex]!);
      discoveryIndex += 1;
    }
    if (discoveryIndex < discoveries.length && out.length < BATCH_SIZE) {
      out.push(discoveries[discoveryIndex]!);
      discoveryIndex += 1;
    }
  }
  return out.slice(0, BATCH_SIZE);
}

function pickReplays(popular: HallDjPopularTrack[]): SpotifyTrackCard[] {
  if (popular.length === 0) return [];
  const top = popular.slice(0, 6);
  return top.map((entry) => entry.track);
}

function seedTrackIds(popular: HallDjPopularTrack[]): string[] {
  return popular
    .map((entry) => entry.track.id?.trim())
    .filter((id): id is string => Boolean(id))
    .slice(0, 5);
}

function resolveSeedGenre(preferredGenre: string): string {
  return preferredGenre || DEFAULT_HALL_DJ_GENRE;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Fallback when there is no listening history — discovery via search-based API. */
async function fetchRandomDjTracks(genre: string): Promise<SpotifyTrackCard[]> {
  const seedGenre = resolveSeedGenre(genre);

  try {
    const discovered = await fetchSpotifyRecommendations({
      seedGenres: [seedGenre],
      limit: BATCH_SIZE,
    });
    if (discovered.length > 0) return shuffle(discovered);
  } catch {
    // Try a single simple search below.
  }

  const year = new Date().getFullYear();
  try {
    const tracks = await searchSpotifyTracks(`year:${year}`, BATCH_SIZE);
    if (tracks.length > 0) return shuffle(tracks);
  } catch {
    // Last resort handled by caller.
  }

  return [];
}

export async function buildHallDjBatch(preferredGenre: string): Promise<SpotifyTrackCard[]> {
  const localPopular = hallDjPopularTracksLast7Days(12);
  let popular = localPopular;
  try {
    const recent = await fetchSpotifyRecentlyPlayed(50);
    popular = mergeSpotifyRecentPlays(localPopular, recent);
  } catch {
    // Local history still works when Spotify recently-played scope is missing.
  }

  const replays = pickReplays(popular);
  const seedTracks = seedTrackIds(popular);
  const seedGenre = resolveSeedGenre(preferredGenre);

  let discoveries: SpotifyTrackCard[] = [];
  try {
    discoveries = await fetchSpotifyRecommendations({
      seedGenres: seedTracks.length >= 3 ? [] : [seedGenre],
      seedTracks,
      limit: BATCH_SIZE,
    });
  } catch {
    discoveries = [];
  }

  const exclude = new Set<string>();
  const replayPool = dedupeTracks(replays, exclude);
  for (const track of replayPool) exclude.add(trackKey(track));

  const discoveryPool = dedupeTracks(discoveries, exclude);
  const batch = interleave(replayPool, discoveryPool);

  if (batch.length > 0) return batch;

  if (discoveryPool.length > 0) return discoveryPool.slice(0, BATCH_SIZE);
  if (replayPool.length > 0) return replayPool.slice(0, BATCH_SIZE);

  return fetchRandomDjTracks(preferredGenre);
}
