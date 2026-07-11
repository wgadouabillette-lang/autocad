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
import {
  filterTracksByDjFeedback,
  hallDjApprovedSeedTracks,
  hallDjBlockedTrackIds,
  hallDjTrackWeight,
  sortTracksByDjFeedback,
} from "./hallDjTrackFeedback";

const BATCH_SIZE = 14;
const MAX_REPLAYS = 3;

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

/** Prefer discovery over replays for variety (≈2 discoveries per replay). */
function interleave(replays: SpotifyTrackCard[], discoveries: SpotifyTrackCard[]): SpotifyTrackCard[] {
  const out: SpotifyTrackCard[] = [];
  let replayIndex = 0;
  let discoveryIndex = 0;
  while (
    out.length < BATCH_SIZE &&
    (replayIndex < replays.length || discoveryIndex < discoveries.length)
  ) {
    if (discoveryIndex < discoveries.length) {
      out.push(discoveries[discoveryIndex]!);
      discoveryIndex += 1;
    }
    if (out.length >= BATCH_SIZE) break;
    if (discoveryIndex < discoveries.length) {
      out.push(discoveries[discoveryIndex]!);
      discoveryIndex += 1;
    }
    if (out.length >= BATCH_SIZE) break;
    if (replayIndex < replays.length) {
      out.push(replays[replayIndex]!);
      replayIndex += 1;
    }
  }
  return out.slice(0, BATCH_SIZE);
}

function pickReplays(popular: HallDjPopularTrack[]): SpotifyTrackCard[] {
  if (popular.length === 0) return [];
  const blocked = hallDjBlockedTrackIds();
  const ranked = popular
    .filter((entry) => {
      const id = entry.track.id?.trim();
      return !id || !blocked.has(id);
    })
    .sort((a, b) => {
      const weightDiff = hallDjTrackWeight(b.track.id) - hallDjTrackWeight(a.track.id);
      if (weightDiff !== 0) return weightDiff;
      return b.playCount - a.playCount || b.lastPlayedAt - a.lastPlayedAt;
    });
  return shuffle(ranked.map((entry) => entry.track)).slice(0, MAX_REPLAYS);
}

function seedTrackIds(popular: HallDjPopularTrack[]): string[] {
  const blocked = hallDjBlockedTrackIds();
  const approved = hallDjApprovedSeedTracks(3)
    .map((track) => track.id?.trim())
    .filter((id): id is string => typeof id === "string" && id.length > 0 && !blocked.has(id));
  const fromPopular = shuffle(popular)
    .map((entry) => entry.track.id?.trim())
    .filter((id): id is string => typeof id === "string" && id.length > 0 && !blocked.has(id));
  const merged: string[] = [];
  for (const id of [...approved, ...fromPopular]) {
    if (!merged.includes(id)) merged.push(id);
    // Leave room for the genre seed (Spotify max 5 combined seeds).
    if (merged.length >= 4) break;
  }
  return merged;
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

async function fetchGenreSearchTracks(genre: string, limit: number): Promise<SpotifyTrackCard[]> {
  const seedGenre = resolveSeedGenre(genre);
  const year = new Date().getFullYear();
  const queries = [
    `genre:${seedGenre}`,
    `genre:${seedGenre} year:${year - 2}-${year}`,
    `${seedGenre} hit`,
  ];
  const pools: SpotifyTrackCard[] = [];
  for (const query of queries) {
    try {
      const tracks = await searchSpotifyTracks(query, Math.min(limit, 10));
      pools.push(...tracks);
    } catch {
      // Try next query.
    }
  }
  return shuffle(pools);
}

/** Fallback when there is no listening history — discovery via genre. */
async function fetchRandomDjTracks(genre: string): Promise<SpotifyTrackCard[]> {
  const seedGenre = resolveSeedGenre(genre);

  try {
    const discovered = await fetchSpotifyRecommendations({
      seedGenres: [seedGenre],
      limit: BATCH_SIZE,
    });
    if (discovered.length > 0) {
      return filterTracksByDjFeedback(shuffle(discovered));
    }
  } catch {
    // Try search below.
  }

  const searched = await fetchGenreSearchTracks(seedGenre, BATCH_SIZE);
  if (searched.length > 0) return filterTracksByDjFeedback(searched);
  return [];
}

export async function buildHallDjBatch(preferredGenre: string): Promise<SpotifyTrackCard[]> {
  const seedGenre = resolveSeedGenre(preferredGenre);
  const blocked = hallDjBlockedTrackIds();

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

  const discoveryPools: SpotifyTrackCard[] = [];

  // Always seed with the settings genre so category changes actually apply.
  try {
    const byGenre = await fetchSpotifyRecommendations({
      seedGenres: [seedGenre],
      seedTracks: seedTracks.slice(0, 2),
      limit: BATCH_SIZE,
    });
    discoveryPools.push(...byGenre);
  } catch {
    // Continue with other sources.
  }

  if (seedTracks.length > 0) {
    try {
      const byTracks = await fetchSpotifyRecommendations({
        seedGenres: [seedGenre],
        seedTracks: seedTracks.slice(0, 4),
        limit: BATCH_SIZE,
      });
      discoveryPools.push(...byTracks);
    } catch {
      // Optional second pass.
    }
  }

  try {
    const searched = await fetchGenreSearchTracks(seedGenre, BATCH_SIZE);
    discoveryPools.push(...searched);
  } catch {
    // Search is best-effort.
  }

  const exclude = new Set<string>(blocked);
  const replayPool = sortTracksByDjFeedback(
    filterTracksByDjFeedback(dedupeTracks(replays, exclude)),
  );
  for (const track of replayPool) exclude.add(trackKey(track));

  const discoveryPool = sortTracksByDjFeedback(
    filterTracksByDjFeedback(dedupeTracks(discoveryPools, exclude)),
  );

  let batch = shuffle(interleave(replayPool, discoveryPool));

  if (batch.length < Math.min(6, BATCH_SIZE)) {
    const fallback = await fetchRandomDjTracks(preferredGenre);
    batch = dedupeTracks([...batch, ...fallback], new Set(batch.map(trackKey)));
  }

  if (batch.length === 0) {
    batch = await fetchRandomDjTracks(preferredGenre);
  }

  batch = batch.slice(0, BATCH_SIZE);
  return batch;
}
