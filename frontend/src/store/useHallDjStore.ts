import { create } from "zustand";
import { buildHallDjBatch } from "../lib/hallDjEngine";
import type { SpotifyTrackCard } from "../lib/connectorsApi";
import { fetchSpotifyRecommendations, searchSpotifyTracks } from "../lib/connectorsApi";
import { DEFAULT_HALL_DJ_GENRE } from "../lib/hallDjGenres";
import {
  filterTracksByDjFeedback,
  isHallDjTrackBlocked,
  recordHallDjServedTracks,
  recordHallDjTrackFeedback,
  type HallDjTrackVerdict,
} from "../lib/hallDjTrackFeedback";
import { useSpotifyPlayerStore } from "./useSpotifyPlayerStore";
import { useStore } from "./useStore";
import { ensureSpotifyWebPlayer, warmSpotifyWebPlayer } from "../lib/spotifyWebPlayback";
import { hallDjPopularTracksLast7Days } from "../lib/hallDjPlayHistory";
import { hasFormaDesktop } from "../lib/formaDesktop";

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
  /** Rebuild queue for a new settings genre while DJ is running. */
  applyPreferredGenre: (genre: string) => Promise<void>;
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

async function waitForPlaybackStarted(timeoutMs = 800): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (trackIsPlaying()) return true;
    await sleep(80);
  }
  return trackIsPlaying();
}

const MAX_START_ATTEMPTS = 2;
const START_DJ_TIMEOUT_MS = 55_000;

/** Évite les double-clics ; récupère si loading reste bloqué après stop/refill. */
let hallDjStartInFlight = false;

function purgeTrackFromQueue(trackId: string) {
  useSpotifyPlayerStore.setState((state) => ({
    queue: state.queue.filter((track) => track.id?.trim() !== trackId),
  }));
}

function queueFreshTracks(tracks: SpotifyTrackCard[], mode: "replace" | "append") {
  const usable = tracks.filter((track) => !isHallDjTrackBlocked(track.id));
  if (usable.length === 0) return [] as SpotifyTrackCard[];
  recordHallDjServedTracks(usable);
  if (mode === "replace") {
    useSpotifyPlayerStore.setState({ queue: usable, queueAddFlashAt: Date.now() });
  } else {
    useSpotifyPlayerStore.setState((state) => {
      const existingKeys = new Set(state.queue.map(trackKey));
      if (state.currentTrack) existingKeys.add(trackKey(state.currentTrack));
      const fresh = usable.filter((track) => !existingKeys.has(trackKey(track)));
      if (fresh.length === 0) return state;
      return {
        queue: [...state.queue, ...fresh],
        queueAddFlashAt: Date.now(),
      };
    });
  }
  return usable;
}

async function startPlaylist(tracks: SpotifyTrackCard[]): Promise<boolean> {
  if (tracks.length === 0) return false;

  const player = useSpotifyPlayerStore.getState();
  const attempts = Math.min(tracks.length, MAX_START_ATTEMPTS);
  for (let index = 0; index < attempts; index += 1) {
    const track = tracks[index]!;
    const rest = tracks.slice(index + 1);
    useSpotifyPlayerStore.setState({ queue: rest });
    recordHallDjServedTracks([track, ...rest]);
    const started = await player.playTrack(track, { skipHistory: true });
    if (started || trackIsPlaying()) return true;
    const waitMs = hasFormaDesktop() ? 5_000 : 800;
    if (await waitForPlaybackStarted(waitMs)) return true;
  }

  return false;
}

async function appendSimilarTracksToQueue(track: SpotifyTrackCard): Promise<void> {
  const trackId = track.id?.trim();
  if (!trackId) return;
  try {
    const preferredGenre = useStore.getState().hallDjPreferredGenre;
    const similar = await fetchSpotifyRecommendations({
      seedTracks: [trackId],
      seedGenres: [preferredGenre],
      limit: 8,
    });
    const filtered = filterTracksByDjFeedback(similar);
    if (filtered.length === 0) return;
    queueFreshTracks(filtered, "append");
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
    if (get().loading || hallDjStartInFlight) return;
    hallDjStartInFlight = true;
    set({ loading: true, error: null, active: true, feedbackResolvedTrackId: null });
    const startedAt = Date.now();
    const timedOut = () => Date.now() - startedAt > START_DJ_TIMEOUT_MS;
    try {
      const playerStore = useSpotifyPlayerStore.getState();
      const preferredGenre = useStore.getState().hallDjPreferredGenre;
      const seedGenre = preferredGenre || DEFAULT_HALL_DJ_GENRE;

      warmSpotifyWebPlayer(true);
      void ensureSpotifyWebPlayer({
        premiumHint: playerStore.premiumAvailable !== false,
      });
      void playerStore.refreshPlayerConfig();

      const batchPromise = buildHallDjBatch(preferredGenre);
      const remoteTracksPromise = searchSpotifyTracks(`genre:${seedGenre}`, 8).catch(
        () => [] as SpotifyTrackCard[],
      );
      const localTracks = filterTracksByDjFeedback(
        hallDjPopularTracksLast7Days(6).map((entry) => entry.track),
      );

      if (playerStore.premiumAvailable === false) {
        const message =
          "Votre compte Spotify connecté doit être Premium pour utiliser le Hall DJ";
        set({ loading: false, active: false, error: message, feedbackResolvedTrackId: null });
        useSpotifyPlayerStore.setState({ playerNotice: message });
        return;
      }

      let quickTracks = localTracks;
      if (quickTracks.length === 0) {
        quickTracks = filterTracksByDjFeedback(await remoteTracksPromise);
      }

      if (quickTracks.length > 0) {
        useSpotifyPlayerStore.setState({ queue: [] });
        const started = await startPlaylist(quickTracks);
        void batchPromise.then((batch) => {
          if (batch.length > 0) queueFreshTracks(batch, "append");
        });
        if (timedOut()) {
          set({
            loading: false,
            active: false,
            error: "Le Hall DJ met trop de temps à démarrer. Réessayez.",
          });
          return;
        }
        if (started) {
          set({ loading: false, error: null });
          return;
        }
      }

      const batch = await batchPromise;
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

      useSpotifyPlayerStore.setState({ queue: [] });
      const started = await startPlaylist(batch);
      if (timedOut()) {
        set({
          loading: false,
          active: false,
          error: "Le Hall DJ met trop de temps à démarrer. Réessayez.",
        });
        return;
      }
      if (!started) {
        if (await waitForPlaybackStarted(hasFormaDesktop() ? 8_000 : 1_500)) {
          set({ loading: false, error: null });
          return;
        }
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
        active: false,
        error: err instanceof Error ? err.message : "Impossible de démarrer le Hall DJ.",
      });
    } finally {
      hallDjStartInFlight = false;
    }
  },

  applyPreferredGenre: async (genre) => {
    if (!get().active || get().loading) return;
    set({ loading: true, error: null });
    try {
      const batch = await buildHallDjBatch(genre);
      if (batch.length === 0) {
        set({ loading: false });
        return;
      }
      useSpotifyPlayerStore.setState({ queue: [] });
      const started = await startPlaylist(batch);
      set({
        loading: false,
        active: started,
        feedbackResolvedTrackId: null,
        error: started ? null : "Impossible d'appliquer le nouveau style Hall DJ.",
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Impossible d'appliquer le style Hall DJ.",
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
      queueFreshTracks(batch, "append");

      const after = useSpotifyPlayerStore.getState();
      if (!after.playing && get().active) {
        const [next, ...rest] = after.queue;
        if (next) {
          useSpotifyPlayerStore.setState({ queue: rest });
          await after.playTrack(next, { skipHistory: true, restart: true });
        }
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
        purgeTrackFromQueue(trackId);
        await get().skipNext();
      }
      void get().refillIfNeeded();
    } finally {
      set({ feedbackBusy: false });
    }
  },
}));
