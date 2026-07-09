import { create } from "zustand";
import { buildHallDjBatch } from "../lib/hallDjEngine";
import type { SpotifyTrackCard } from "../lib/connectorsApi";
import { fetchSpotifyRecommendations } from "../lib/connectorsApi";
import {
  recordHallDjTrackFeedback,
  type HallDjTrackVerdict,
} from "../lib/hallDjTrackFeedback";
import { useSpotifyPlayerStore } from "./useSpotifyPlayerStore";
import { useStore } from "./useStore";

interface HallDjState {
  active: boolean;
  loading: boolean;
  error: string | null;
  feedbackResolvedTrackId: string | null;
  feedbackBusy: boolean;
  startDj: () => Promise<void>;
  skipNext: () => Promise<void>;
  stopDj: () => void;
  refillIfNeeded: () => Promise<void>;
  rateCurrentTrack: (verdict: HallDjTrackVerdict) => Promise<void>;
}

function trackKey(track: { id?: string; name: string; artists: string }) {
  return track.id ?? `${track.name}::${track.artists}`;
}

function trackIsPlaying(): boolean {
  const { playing, playbackMode, currentTrack } = useSpotifyPlayerStore.getState();
  return Boolean(currentTrack && (playing || playbackMode !== null));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForPlaybackStarted(timeoutMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (trackIsPlaying()) return true;
    await sleep(120);
  }
  return trackIsPlaying();
}

const MAX_START_ATTEMPTS = 4;
const START_DJ_TIMEOUT_MS = 55_000;

async function startPlaylist(tracks: SpotifyTrackCard[]): Promise<boolean> {
  if (tracks.length === 0) return false;

  const player = useSpotifyPlayerStore.getState();
  await player.refreshPlayerConfig();

  const attempts = Math.min(tracks.length, MAX_START_ATTEMPTS);
  for (let index = 0; index < attempts; index += 1) {
    const track = tracks[index]!;
    const rest = tracks.slice(index + 1);
    useSpotifyPlayerStore.setState({ queue: rest });
    await player.playTrack(track, { skipHistory: true });
    if (await waitForPlaybackStarted()) return true;
  }

  return false;
}

async function appendSimilarTracksToQueue(track: SpotifyTrackCard): Promise<void> {
  const trackId = track.id?.trim();
  if (!trackId) return;
  try {
    const similar = await fetchSpotifyRecommendations({
      seedTracks: [trackId],
      limit: 8,
    });
    if (similar.length === 0) return;
    const player = useSpotifyPlayerStore.getState();
    const existingKeys = new Set<string>();
    if (player.currentTrack) existingKeys.add(trackKey(player.currentTrack));
    for (const entry of player.queue) existingKeys.add(trackKey(entry));
    const fresh = similar.filter((entry) => !existingKeys.has(trackKey(entry)));
    if (fresh.length === 0) return;
    useSpotifyPlayerStore.setState((state) => ({
      queue: [...state.queue, ...fresh],
      queueAddFlashAt: Date.now(),
    }));
  } catch {
    // Recommendations may fail when offline or scope is missing.
  }
}

export const useHallDjStore = create<HallDjState>((set, get) => ({
  active: false,
  loading: false,
  error: null,
  feedbackResolvedTrackId: null,
  feedbackBusy: false,

  stopDj: () => {
    set({ active: false, error: null, feedbackResolvedTrackId: null, feedbackBusy: false });
  },

  startDj: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    const startedAt = Date.now();
    const timedOut = () => Date.now() - startedAt > START_DJ_TIMEOUT_MS;
    try {
      const preferredGenre = useStore.getState().hallDjPreferredGenre;
      const batch = await buildHallDjBatch(preferredGenre);
      if (timedOut()) {
        set({
          loading: false,
          active: false,
          error: "Le Hall DJ met trop de temps à démarrer. Réessayez.",
        });
        return;
      }
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
        set({
          loading: false,
          error: null,
          active: true,
          feedbackResolvedTrackId: null,
        });
        return;
      }

      const started = await startPlaylist(nextBatch);
      if (timedOut()) {
        set({
          loading: false,
          active: false,
          error: "Le Hall DJ met trop de temps à démarrer. Réessayez.",
        });
        return;
      }
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
      set({
        loading: false,
        error: null,
        active: true,
        feedbackResolvedTrackId: null,
      });
    } catch (err) {
      set({
        loading: false,
        active: false,
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

  rateCurrentTrack: async (verdict) => {
    if (!get().active || get().feedbackBusy) return;
    const track = useSpotifyPlayerStore.getState().currentTrack;
    const trackId = track?.id?.trim();
    if (!track || !trackId) return;
    if (get().feedbackResolvedTrackId === trackId) return;

    set({ feedbackBusy: true });
    try {
      recordHallDjTrackFeedback(track, verdict);
      set({ feedbackResolvedTrackId: trackId });
      if (verdict === "approve") {
        await appendSimilarTracksToQueue(track);
      } else {
        await get().skipNext();
      }
      void get().refillIfNeeded();
    } finally {
      set({ feedbackBusy: false });
    }
  },
}));
