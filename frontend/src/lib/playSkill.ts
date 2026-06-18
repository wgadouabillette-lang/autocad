import { playSpotifyTrack, type SpotifyPlayResult } from "./connectorsApi";

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

export type PlaySkillResult = SpotifyPlayResult & {
  summary: string;
};

export async function runPlaySkill(
  query: string,
  signal?: AbortSignal,
): Promise<PlaySkillResult> {
  const result = await playSpotifyTrack(query, signal);
  const track = result.track;
  const summary = track
    ? result.playing
      ? `Lecture de **${track.name}** — ${track.artists}.`
      : `**${track.name}** — ${track.artists} (lecture non démarrée).`
    : "Aucune piste trouvée.";
  return { ...result, summary };
}
