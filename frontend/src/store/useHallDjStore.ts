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
import {
  activateSpotifyPlaybackFromUserGesture,
  clearSpotifyFullPlaybackLock,
  ensureSpotifyWebPlayer,
  stopSpotifyWebPlayback,
  warmSpotifyWebPlayer,
} from "../lib/spotifyWebPlayback";
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
  /**
   * From /play now-playing thumbs: arm Meetra DJ.
   * approve → keep current track, queue DJ after it.
   * reject → skip now and start DJ on the next track.
   */
  engageFromNowPlaying: (verdict: HallDjTrackVerdict) => Promise<void>;
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

function publishDjFailure(message: string) {
  useSpotifyPlayerStore.setState({ playerNotice: message });
}

const MAX_START_ATTEMPTS = 5;
const START_DJ_TIMEOUT_MS = 55_000;
const QUEUE_REFILL_THRESHOLD = 5;

/** Évite les double-clics ; récupère si loading reste bloqué après stop/refill. */
let hallDjStartInFlight = false;
/** Background refill must not flip `loading` (that blocked skip for seconds). */
let hallDjRefillInFlight = false;
let hallDjSkipInFlight = false;
/** Bumped by stopDj so in-flight start/skip cannot restart audio after Stop. */
let hallDjSession = 0;

function isHallDjSession(session: number): boolean {
  return session === hallDjSession;
}

function haltSpotifyAudioAfterDjAbort() {
  void stopSpotifyWebPlayback();
  useSpotifyPlayerStore.setState({
    playing: false,
    currentTrack: null,
    playbackMode: null,
    queue: [],
  });
}

function purgeTrackFromQueue(trackId: string) {
  useSpotifyPlayerStore.setState((state) => ({
    queue: state.queue.filter((track) => track.id?.trim() !== trackId),
  }));
}

function queueFreshTracks(tracks: SpotifyTrackCard[], mode: "replace" | "append") {
  const usable = tracks.filter((track) => !isHallDjTrackBlocked(track.id));
  if (usable.length === 0) return [] as SpotifyTrackCard[];
  // Do NOT mark as "recently served" here — only after a successful play.
  // Premature marking emptied the DJ pool after a failed start.
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

function preferredSeedGenre(): string {
  return useStore.getState().hallDjPreferredGenre || DEFAULT_HALL_DJ_GENRE;
}

/** Cheap local/search seeds so skip never waits on full buildHallDjBatch. */
async function seedQueueQuickly(excludeTrackId?: string | null): Promise<SpotifyTrackCard[]> {
  if (useSpotifyPlayerStore.getState().queue.length > 0) {
    return useSpotifyPlayerStore.getState().queue;
  }

  const exclude = excludeTrackId?.trim() || null;
  const localTracks = filterTracksByDjFeedback(
    hallDjPopularTracksLast7Days(6).map((entry) => entry.track),
  ).filter((track) => track.id?.trim() !== exclude);

  if (localTracks.length > 0) {
    return queueFreshTracks(localTracks, "append");
  }

  try {
    const remote = filterTracksByDjFeedback(
      await searchSpotifyTracks(`genre:${preferredSeedGenre()}`, 8),
    ).filter((track) => track.id?.trim() !== exclude);
    if (remote.length > 0) {
      return queueFreshTracks(remote, "append");
    }
  } catch {
    // Fall through to empty — caller may await full batch.
  }
  return [];
}

async function startPlaylist(
  tracks: SpotifyTrackCard[],
  session: number,
): Promise<boolean> {
  if (tracks.length === 0) return false;
  if (!isHallDjSession(session)) return false;

  const attempts = Math.min(tracks.length, MAX_START_ATTEMPTS);
  for (let index = 0; index < attempts; index += 1) {
    if (!isHallDjSession(session)) {
      haltSpotifyAudioAfterDjAbort();
      return false;
    }
    const track = tracks[index]!;
    const rest = tracks.slice(index + 1);
    useSpotifyPlayerStore.setState({ queue: rest });
    // restart: true avoids pause-toggle if the same track is already current.
    const started = await useSpotifyPlayerStore
      .getState()
      .playTrack(track, { skipHistory: true, restart: true });
    if (!isHallDjSession(session)) {
      haltSpotifyAudioAfterDjAbort();
      return false;
    }
    if (started || trackIsPlaying()) {
      recordHallDjServedTracks([track]);
      return true;
    }
    // Device / Widevine can lag behind the first PUT play.
    const catchUpMs = hasFormaDesktop() ? 2_500 : 1_000;
    if (await waitForPlaybackStarted(catchUpMs)) {
      if (!isHallDjSession(session)) {
        haltSpotifyAudioAfterDjAbort();
        return false;
      }
      recordHallDjServedTracks([track]);
      return true;
    }
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
    hallDjSession += 1;
    hallDjStartInFlight = false;
    hallDjSkipInFlight = false;
    hallDjRefillInFlight = false;
    set({
      active: false,
      loading: false,
      error: null,
      feedbackResolvedTrackId: null,
      feedbackBusy: false,
    });
  },

  startDj: async () => {
    if (get().loading || hallDjStartInFlight) return;
    hallDjStartInFlight = true;
    const session = ++hallDjSession;
    // Keep active=false until audio actually starts so the button shows a spinner,
    // not Skip (which no-op'd while loading and looked like a dead DJ).
    set({ loading: true, error: null, active: false, feedbackResolvedTrackId: null });
    const startedAt = Date.now();
    const timedOut = () => Date.now() - startedAt > START_DJ_TIMEOUT_MS;
    const fail = (message: string) => {
      if (!isHallDjSession(session)) return;
      set({ loading: false, active: false, error: message, feedbackResolvedTrackId: null });
      publishDjFailure(message);
    };
    try {
      const playerStore = useSpotifyPlayerStore.getState();
      const preferredGenre = useStore.getState().hallDjPreferredGenre;
      const seedGenre = preferredGenre || DEFAULT_HALL_DJ_GENRE;

      clearSpotifyFullPlaybackLock();
      warmSpotifyWebPlayer(true);

      // Fetch tracks in parallel with player warm-up — do not serialize behind device ready.
      // Prefer discovery (artist/top/search fallbacks) over raw `genre:` queries which
      // often return empty for newer Spotify apps / markets.
      const batchPromise = buildHallDjBatch(preferredGenre);
      const remoteTracksPromise = fetchSpotifyRecommendations({
        seedGenres: [seedGenre],
        limit: 12,
      }).catch(() => [] as SpotifyTrackCard[]);
      const genreSearchPromise = searchSpotifyTracks(`${seedGenre} hit`, 10).catch(
        () => [] as SpotifyTrackCard[],
      );
      const localTracks = filterTracksByDjFeedback(
        hallDjPopularTracksLast7Days(8).map((entry) => entry.track),
      );

      await playerStore.refreshPlayerConfig(true);
      if (!isHallDjSession(session)) return;
      if (useSpotifyPlayerStore.getState().premiumAvailable === false) {
        fail("Votre compte Spotify connecté doit être Premium pour utiliser le Meetra DJ");
        return;
      }

      await ensureSpotifyWebPlayer({ premiumHint: true });
      if (!isHallDjSession(session)) return;
      // Re-assert gesture activation after init (click handler also calls this first).
      await activateSpotifyPlaybackFromUserGesture();
      if (!isHallDjSession(session)) return;

      let quickTracks = localTracks;
      if (quickTracks.length === 0) {
        quickTracks = filterTracksByDjFeedback(await remoteTracksPromise);
      }
      if (!isHallDjSession(session)) return;
      if (quickTracks.length === 0) {
        quickTracks = filterTracksByDjFeedback(await genreSearchPromise);
      }
      if (!isHallDjSession(session)) return;
      // Absolute fallback: raw search results if feedback filter still emptied the pool.
      if (quickTracks.length === 0) {
        const raw = [...(await remoteTracksPromise), ...(await genreSearchPromise)];
        quickTracks = raw.filter((track) => !isHallDjTrackBlocked(track.id));
      }
      if (!isHallDjSession(session)) return;

      if (quickTracks.length > 0) {
        useSpotifyPlayerStore.setState({ queue: [] });
        const started = await startPlaylist(quickTracks, session);
        void batchPromise.then((batch) => {
          if (batch.length > 0 && isHallDjSession(session) && get().active) {
            queueFreshTracks(batch, "append");
          }
        });
        if (!isHallDjSession(session)) return;
        if (timedOut()) {
          fail("Le Meetra DJ met trop de temps à démarrer. Réessayez.");
          return;
        }
        if (started) {
          set({ loading: false, active: true, error: null });
          void get().refillIfNeeded();
          return;
        }
      }

      const batch = await batchPromise;
      if (!isHallDjSession(session)) return;
      if (timedOut()) {
        fail("Le Meetra DJ met trop de temps à démarrer. Réessayez.");
        return;
      }
      const batchUsable =
        batch.length > 0
          ? batch
          : filterTracksByDjFeedback(await remoteTracksPromise);
      if (!isHallDjSession(session)) return;
      if (batchUsable.length === 0) {
        fail("Impossible de trouver des titres Spotify. Vérifiez la connexion Spotify.");
        return;
      }

      useSpotifyPlayerStore.setState({ queue: [] });
      const started = await startPlaylist(batchUsable, session);
      if (!isHallDjSession(session)) return;
      if (timedOut()) {
        fail("Le Meetra DJ met trop de temps à démarrer. Réessayez.");
        return;
      }
      if (!started) {
        if (await waitForPlaybackStarted(hasFormaDesktop() ? 3_000 : 1_500)) {
          if (!isHallDjSession(session)) {
            haltSpotifyAudioAfterDjAbort();
            return;
          }
          set({ loading: false, active: true, error: null });
          void get().refillIfNeeded();
          return;
        }
        fail(
          useSpotifyPlayerStore.getState().playerNotice?.trim() ||
            "Impossible de lancer la lecture. Reconnectez Spotify ou réessayez.",
        );
        return;
      }
      set({ loading: false, active: true, error: null });
      void get().refillIfNeeded();
    } catch (err) {
      if (!isHallDjSession(session)) return;
      fail(err instanceof Error ? err.message : "Impossible de démarrer le Meetra DJ.");
    } finally {
      if (isHallDjSession(session)) {
        hallDjStartInFlight = false;
        if (get().loading && !get().active) {
          set({ loading: false });
        }
      } else {
        hallDjStartInFlight = false;
      }
    }
  },

  applyPreferredGenre: async (genre) => {
    if (!get().active || get().loading) return;
    const session = hallDjSession;
    set({ loading: true, error: null });
    try {
      const batch = await buildHallDjBatch(genre);
      if (!isHallDjSession(session)) return;
      if (batch.length === 0) {
        set({ loading: false });
        return;
      }
      useSpotifyPlayerStore.setState({ queue: [] });
      const started = await startPlaylist(batch, session);
      if (!isHallDjSession(session)) return;
      set({
        loading: false,
        active: started,
        feedbackResolvedTrackId: null,
        error: started ? null : "Impossible d'appliquer le nouveau style Meetra DJ.",
      });
      if (!started) {
        publishDjFailure("Impossible d'appliquer le nouveau style Meetra DJ.");
      }
    } catch (err) {
      if (!isHallDjSession(session)) return;
      const message =
        err instanceof Error ? err.message : "Impossible d'appliquer le style Meetra DJ.";
      set({ loading: false, error: message });
      publishDjFailure(message);
    }
  },

  skipNext: async () => {
    if (!get().active || get().loading || hallDjSkipInFlight) return;
    hallDjSkipInFlight = true;
    const session = hallDjSession;
    try {
      if (useSpotifyPlayerStore.getState().queue.length === 0) {
        await seedQueueQuickly(useSpotifyPlayerStore.getState().currentTrack?.id);
      }
      if (!isHallDjSession(session) || !get().active) return;
      if (useSpotifyPlayerStore.getState().queue.length === 0) {
        const preferredGenre = useStore.getState().hallDjPreferredGenre;
        const batch = await buildHallDjBatch(preferredGenre);
        if (!isHallDjSession(session) || !get().active) return;
        if (batch.length > 0) queueFreshTracks(batch, "append");
      }
      if (!isHallDjSession(session) || !get().active) return;
      if (useSpotifyPlayerStore.getState().queue.length === 0) return;

      await useSpotifyPlayerStore.getState().skipNext();
      if (!isHallDjSession(session) || !get().active) {
        haltSpotifyAudioAfterDjAbort();
        return;
      }
      const nowPlaying = useSpotifyPlayerStore.getState().currentTrack;
      if (nowPlaying) recordHallDjServedTracks([nowPlaying]);
      set({ feedbackResolvedTrackId: null });
      void get().refillIfNeeded();
    } finally {
      hallDjSkipInFlight = false;
    }
  },

  refillIfNeeded: async () => {
    if (!get().active || get().loading || hallDjRefillInFlight) return;
    const { queue } = useSpotifyPlayerStore.getState();
    if (queue.length >= QUEUE_REFILL_THRESHOLD) return;

    hallDjRefillInFlight = true;
    try {
      const preferredGenre = useStore.getState().hallDjPreferredGenre;
      const batch = await buildHallDjBatch(preferredGenre);
      if (batch.length === 0 || !get().active) return;
      queueFreshTracks(batch, "append");
    } catch {
      // Ignore refill errors; skip/start will surface failures when needed.
    } finally {
      hallDjRefillInFlight = false;
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

  engageFromNowPlaying: async (verdict) => {
    if (get().feedbackBusy) return;
    if (get().active) {
      await get().rateCurrentTrack(verdict);
      return;
    }

    const track = useSpotifyPlayerStore.getState().currentTrack;
    const trackId = track?.id?.trim();
    if (!track || !trackId) return;

    const session = ++hallDjSession;
    set({ feedbackBusy: true, active: true, error: null, loading: false });
    try {
      recordHallDjTrackFeedback(track, verdict);
      set({ feedbackResolvedTrackId: trackId });

      if (verdict === "approve") {
        void (async () => {
          if (!isHallDjSession(session) || !get().active) return;
          await appendSimilarTracksToQueue(track);
          if (!isHallDjSession(session) || !get().active) return;
          await seedQueueQuickly(trackId);
          if (!isHallDjSession(session) || !get().active) return;
          void get().refillIfNeeded();
        })();
        return;
      }

      purgeTrackFromQueue(trackId);
      let usable = await seedQueueQuickly(trackId);
      if (!isHallDjSession(session)) return;
      if (usable.length === 0) {
        const preferredGenre = useStore.getState().hallDjPreferredGenre;
        const batch = await buildHallDjBatch(preferredGenre);
        if (!isHallDjSession(session)) return;
        usable = filterTracksByDjFeedback(batch).filter(
          (entry) => entry.id?.trim() !== trackId,
        );
      }
      if (usable.length === 0) {
        const message = "Impossible de trouver une prochaine piste Meetra DJ.";
        set({ error: message });
        publishDjFailure(message);
        return;
      }
      useSpotifyPlayerStore.setState({ queue: [] });
      const started = await startPlaylist(usable, session);
      if (!isHallDjSession(session)) return;
      if (started) {
        set({ feedbackResolvedTrackId: null, error: null });
        void get().refillIfNeeded();
      } else {
        const message = "Impossible de lancer le Meetra DJ.";
        set({ error: message });
        publishDjFailure(message);
      }
    } catch (err) {
      if (!isHallDjSession(session)) return;
      const message =
        err instanceof Error ? err.message : "Impossible d'engager le Meetra DJ.";
      set({ error: message });
      publishDjFailure(message);
    } finally {
      if (isHallDjSession(session)) set({ feedbackBusy: false });
      else set({ feedbackBusy: false });
    }
  },
}));
