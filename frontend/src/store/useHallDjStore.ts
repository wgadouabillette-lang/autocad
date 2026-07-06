import { create } from "zustand";
import { buildHallDjBatch } from "../lib/hallDjEngine";
import type { SpotifyTrackCard } from "../lib/connectorsApi";
import { useSpotifyPlayerStore } from "./useSpotifyPlayerStore";
import { useStore } from "./useStore";

interface HallDjState {
  active: boolean;
  loading: boolean;
  error: string | null;
  startDj: () => Promise<void>;
  skipNext: () => Promise<void>;
  stopDj: () => void;
  refillIfNeeded: () => Promise<void>;
}

function trackKey(track: { id?: string; name: string; artists: string }) {
  return track.id ?? `${track.name}::${track.artists}`;
}

function trackIsPlaying(): boolean {
  const { playing, playbackMode } = useSpotifyPlayerStore.getState();
  return playing || playbackMode !== null;
}

async function startPlaylist(tracks: SpotifyTrackCard[]): Promise<boolean> {
  if (tracks.length === 0) return false;

  const player = useSpotifyPlayerStore.getState();
  await player.refreshPlayerConfig();

  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index]!;
    const rest = tracks.slice(index + 1);
    useSpotifyPlayerStore.setState({ queue: rest });
    await player.playTrack(track, { skipHistory: true });
    if (trackIsPlaying()) return true;
  }

  return false;
}

export const useHallDjStore = create<HallDjState>((set, get) => ({
  active: false,
  loading: false,
  error: null,

  stopDj: () => {
    set({ active: false, error: null });
  },

  startDj: async () => {
    if (get().loading) return;
    set({ loading: true, error: null, active: true });
    try {
      const preferredGenre = useStore.getState().hallDjPreferredGenre;
      const batch = await buildHallDjBatch(preferredGenre);
      if (batch.length === 0) {
        set({
          loading: false,
          active: false,
          error: "Impossible de trouver des titres Spotify. Vérifiez la connexion Spotify.",
        });
        return;
      }

      const player = useSpotifyPlayerStore.getState();
      const { playing, currentTrack, queue } = player;
      const existingKeys = new Set<string>();
      if (currentTrack) existingKeys.add(trackKey(currentTrack));
      for (const entry of queue) existingKeys.add(trackKey(entry));

      const fresh = batch.filter((track) => !existingKeys.has(trackKey(track)));
      const nextBatch = fresh.length > 0 ? fresh : batch;

      if (playing && currentTrack) {
        useSpotifyPlayerStore.setState({ queue: [...queue, ...nextBatch] });
        set({ loading: false, error: null });
        return;
      }

      const started = await startPlaylist(nextBatch);
      if (!started) {
        set({
          loading: false,
          active: false,
          error: "Impossible de lancer la lecture. Reconnectez Spotify ou réessayez.",
        });
        useSpotifyPlayerStore.setState({
          playerNotice: "Hall DJ : impossible de lancer une piste. Reconnectez Spotify si besoin.",
        });
        return;
      }
      set({ loading: false, error: null });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Impossible de démarrer le Hall DJ.",
      });
    }
  },

  skipNext: async () => {
    if (!get().active || get().loading) return;
    const player = useSpotifyPlayerStore.getState();
    if (player.queue.length === 0) {
      await get().refillIfNeeded();
    }
    await useSpotifyPlayerStore.getState().skipNext();
    void get().refillIfNeeded();
  },

  refillIfNeeded: async () => {
    if (!get().active || get().loading) return;
    const { queue, playing, currentTrack } = useSpotifyPlayerStore.getState();
    if (queue.length >= 3) return;
    if (!playing && !currentTrack) return;

    set({ loading: true, error: null });
    try {
      const preferredGenre = useStore.getState().hallDjPreferredGenre;
      const batch = await buildHallDjBatch(preferredGenre);
      if (batch.length === 0) {
        set({ loading: false });
        return;
      }
      const player = useSpotifyPlayerStore.getState();
      const existingKeys = new Set<string>();
      if (player.currentTrack) existingKeys.add(trackKey(player.currentTrack));
      for (const entry of player.queue) existingKeys.add(trackKey(entry));
      const fresh = batch.filter((track) => !existingKeys.has(trackKey(track)));
      if (fresh.length === 0) {
        set({ loading: false });
        return;
      }
      useSpotifyPlayerStore.setState((state) => ({
        queue: [...state.queue, ...fresh],
        queueAddFlashAt: Date.now(),
      }));

      const after = useSpotifyPlayerStore.getState();
      if (!after.playing && get().active) {
        const [next, ...rest] = after.queue;
        useSpotifyPlayerStore.setState({ queue: rest });
        await after.playTrack(next!, { skipHistory: true, restart: true });
      }

      set({ loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));
