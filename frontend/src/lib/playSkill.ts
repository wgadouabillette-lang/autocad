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

function buildPlaySummary(result: SpotifyPlayResult): string {
  const track = result.track;
  if (!track) return "Aucune piste trouvée.";

  const label = `**${track.name}** — ${track.artists}`;

  if (result.playing) {
    return `Lecture lancée sur ton appareil Spotify : ${label}.`;
  }

  if (result.requiresActiveDevice) {
    return `Ouvre Spotify sur ton téléphone ou ordinateur, puis réessaie. Piste trouvée : ${label}.`;
  }

  if (result.requiresPremium) {
    if (track.previewUrl) {
      return `Extrait de 30 s disponible dans la carte (bouton ▶). Pour la piste complète depuis Lyte, il faut Spotify Premium — sinon clique la carte pour ouvrir dans Spotify : ${label}.`;
    }
    return `Pas d'extrait pour cette piste. Clique la carte pour l'ouvrir dans Spotify : ${label}.`;
  }

  return `${label} (lecture non démarrée).`;
}

export async function runPlaySkill(
  query: string,
  signal?: AbortSignal,
): Promise<PlaySkillResult> {
  const result = await playSpotifyTrack(query, signal);
  return { ...result, summary: buildPlaySummary(result) };
}
