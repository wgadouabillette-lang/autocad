import type { SpotifyTrackCard } from "./connectorsApi";
import { getLocalPresenceActivityForSync } from "./localPresenceActivity";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";

export interface SpotifyNowPlayingSnapshot {
  label: string;
  imageUrl: string | null;
}

export function formatSpotifyNowPlaying(track: Pick<SpotifyTrackCard, "name" | "artists">): string {
  const name = track.name?.trim() || "Sans titre";
  const artists = track.artists?.trim();
  return artists ? `${name} — ${artists}` : name;
}

export function spotifyNowPlayingFromTrack(track: SpotifyTrackCard): SpotifyNowPlayingSnapshot {
  return {
    label: formatSpotifyNowPlaying(track),
    imageUrl: track.imageUrl?.trim() || null,
  };
}

export function getLocalSpotifyNowPlayingForSync(workspaceId: string): SpotifyNowPlayingSnapshot | null {
  if (getLocalPresenceActivityForSync(workspaceId) !== "spotify") return null;
  const { playing, currentTrack } = useSpotifyPlayerStore.getState();
  if (!playing || !currentTrack) return null;
  return spotifyNowPlayingFromTrack(currentTrack);
}
