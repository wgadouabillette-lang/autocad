import { searchSpotifyTracks, type SpotifyTrackCard } from "./connectorsApi";

export const PLAY_SKILL_TEMPLATE = `/play `;
export const ADD_QUEUE_SKILL_TEMPLATE = `/add-queue `;

export function isPlaySkillPrompt(text: string): boolean {
  return /(?:^|\s)\/play\b/i.test(text.trim());
}

export function isAddQueueSkillPrompt(text: string): boolean {
  return /(?:^|\s)\/add-queue\b/i.test(text.trim());
}

export function parsePlaySkillQuery(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/\/play(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const query = (match[1] ?? "").trim();
  return query || null;
}

export function parseAddQueueSkillQuery(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/\/add-queue(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const query = (match[1] ?? "").trim();
  return query || null;
}

export interface PlaySearchSkillResult {
  query: string;
  tracks: SpotifyTrackCard[];
  summary: string;
}

function buildSearchSummary(query: string, tracks: SpotifyTrackCard[]): string {
  if (tracks.length === 0) {
    return `Aucun résultat pour « ${query} ».`;
  }
  return `${tracks.length} résultat${tracks.length > 1 ? "s" : ""} trouvé${tracks.length > 1 ? "s" : ""} pour « ${query} ».`;
}

export async function runPlaySearchSkill(
  query: string,
  signal?: AbortSignal,
): Promise<PlaySearchSkillResult> {
  const tracks = await searchSpotifyTracks(query, 8, signal);
  return {
    query,
    tracks,
    summary: buildSearchSummary(query, tracks),
  };
}

function normalizeTrackText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PLAY_CHOICE_LIMIT = 4;

function trackChoiceScore(track: SpotifyTrackCard, query: string): number {
  const wanted = normalizeTrackText(query);
  if (!wanted) return 0;
  const name = normalizeTrackText(track.name);
  const blob = normalizeTrackText(`${track.name} ${track.artists}`);
  if (name === wanted) return 400;
  if (name.startsWith(wanted) || wanted.startsWith(name)) return 300;
  if (blob.includes(wanted)) return 200;
  const tokens = wanted.split(" ").filter((token) => token.length > 1);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((token) => blob.includes(token)).length;
  return Math.round((hits / tokens.length) * 100);
}

/** Les titres les plus proches de la demande, dans l'ordre de correspondance. */
export function pickTopSpotifyTracks(
  tracks: SpotifyTrackCard[],
  query: string,
  limit = PLAY_CHOICE_LIMIT,
): SpotifyTrackCard[] {
  return tracks
    .map((track, index) => ({ track, index, score: trackChoiceScore(track, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.track);
}

export async function runPlayTrackChoices(
  query: string,
  signal?: AbortSignal,
  offset = 0,
): Promise<SpotifyTrackCard[]> {
  const tracks = await searchSpotifyTracks(query, 10, signal, offset);
  return pickTopSpotifyTracks(tracks, query, 10);
}

/** Garde le titre le plus proche de la demande, pas la liste complète. */
export function pickBestSpotifyTrack(
  tracks: SpotifyTrackCard[],
  query: string,
): SpotifyTrackCard | null {
  if (tracks.length === 0) return null;
  const wanted = normalizeTrackText(query);
  if (!wanted) return tracks[0] ?? null;
  const ranked = tracks.find((track) => normalizeTrackText(track.name) === wanted);
  if (ranked) return ranked;
  const titled = tracks.find((track) => {
    const name = normalizeTrackText(track.name);
    return name.startsWith(wanted) || wanted.startsWith(name);
  });
  if (titled) return titled;
  const mentioned = tracks.find((track) =>
    normalizeTrackText(`${track.name} ${track.artists}`).includes(wanted),
  );
  return mentioned ?? tracks[0] ?? null;
}

export async function runPlaySingleTrack(
  query: string,
  signal?: AbortSignal,
): Promise<SpotifyTrackCard | null> {
  const tracks = await searchSpotifyTracks(query, 5, signal);
  return pickBestSpotifyTrack(tracks, query);
}
