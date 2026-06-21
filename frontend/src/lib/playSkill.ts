import { searchSpotifyTracks, type SpotifyTrackCard } from "./connectorsApi";

export const PLAY_SKILL_TEMPLATE = `/play `;

export function isPlaySkillPrompt(text: string): boolean {
  return /(?:^|\s)\/play\b/i.test(text.trim());
}

export function parsePlaySkillQuery(text: string): string | null {
  const trimmed = text.trim();
  const match = trimmed.match(/\/play(?:\s+([\s\S]*))?$/i);
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
  const previewCount = tracks.filter((track) => track.previewUrl?.trim()).length;
  const previewHint =
    previewCount > 0
      ? " Clique ▶ sur une piste pour l'écouter directement dans l'app (extrait 30 s)."
      : " Ces pistes n'ont pas d'extrait — ouvre-les dans Spotify via le lien ↗.";
  return `${tracks.length} résultat${tracks.length > 1 ? "s" : ""} pour « ${query} ».${previewHint}`;
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
