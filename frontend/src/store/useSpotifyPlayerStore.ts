import { create } from "zustand";
import {
  fetchSpotifyPlayerConfig,
  searchSpotifyTracks,
  type SpotifyTrackCard,
} from "../lib/connectorsApi";
import {
  cancelSpotifyPlaybackEnded,
  ensureSpotifyWebPlayer,
  pauseSpotifyWebPlayback,
  playSpotifyFullTrack,
  primeSpotifyWebAudioUnlock,
  resumeSpotifyWebPlayback,
  setSpotifyWebPlaybackEndedListener,
  setSpotifyWebPlaybackErrorListener,
  setSpotifyWebPlaybackListener,
  warmSpotifyWebPlayer,
} from "../lib/spotifyWebPlayback";
import { hasFormaDesktop } from "../lib/formaDesktop";
import { primeSpotifyPreviewAudio } from "../lib/spotifyAudioPulse";
import { applyAudioOutputToElement } from "../lib/audioDevices";
import { recordHallDjPlay } from "../lib/hallDjPlayHistory";
import { readUserPreferences } from "../lib/userPreferences";
import { useHallDjStore } from "./useHallDjStore";

let sharedAudio: HTMLAudioElement | null = null;

const PLAYER_CONFIG_TTL_MS = 5 * 60 * 1000;
/** Bumped after Spotify Feb 2026 /me.product removal so stale premium=false caches refresh. */
const PLAYER_CONFIG_CACHE_KEY = "forma-spotify-player-config-v2";
let playerConfigInflight: Promise<void> | null = null;

interface StoredPlayerConfig {
  premiumAvailable: boolean;
  streamingScopeAvailable: boolean;
  refreshedAt: number;
}

function readStoredPlayerConfig(): StoredPlayerConfig | null {
  try {
    const raw = localStorage.getItem(PLAYER_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPlayerConfig;
    if (typeof parsed.premiumAvailable !== "boolean") return null;
    if (typeof parsed.streamingScopeAvailable !== "boolean") return null;
    if (typeof parsed.refreshedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPlayerConfig(premiumAvailable: boolean, streamingScopeAvailable: boolean) {
  try {
    const payload: StoredPlayerConfig = {
      premiumAvailable,
      streamingScopeAvailable,
      refreshedAt: Date.now(),
    };
    localStorage.setItem(PLAYER_CONFIG_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

const storedPlayerConfig = readStoredPlayerConfig();
let playerConfigRefreshedAt = storedPlayerConfig?.refreshedAt ?? 0;

function tracksEqual(a: SpotifyTrackCard | null | undefined, b: SpotifyTrackCard | null | undefined) {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return a.name === b.name && a.artists === b.artists;
}

let suppressTrackEnded = false;
let handlingTrackEnded = false;
/** Ignore preview pause events while switching to full playback. */
let suppressPreviewPauseState = false;

function audioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.dataset.spotifyPlayback = "preview";
    sharedAudio.preload = "auto";
    sharedAudio.addEventListener("ended", () => {
      const state = useSpotifyPlayerStore.getState();
      if (state.playbackMode !== "preview" || suppressTrackEnded) return;
      state.handleTrackEnded();
    });
    sharedAudio.addEventListener("pause", () => {
      if (suppressPreviewPauseState) return;
      const state = useSpotifyPlayerStore.getState();
      if (state.playbackMode === "preview" && !sharedAudio?.ended) {
        useSpotifyPlayerStore.setState({ playing: false });
      }
    });
  }
  return sharedAudio;
}

function stopPreviewAudio(options?: { silent?: boolean }) {
  const audio = sharedAudio;
  if (!audio) return;
  if (options?.silent) suppressPreviewPauseState = true;
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  } finally {
    if (options?.silent) suppressPreviewPauseState = false;
  }
}

export function getSpotifyPreviewAudioElement(): HTMLAudioElement | null {
  return sharedAudio;
}

type PlaybackMode = "full" | "preview" | null;

interface PlayTrackOptions {
  restart?: boolean;
  skipHistory?: boolean;
}

interface SpotifyPlayerState {
  panelOpen: boolean;
  searchQuery: string;
  results: SpotifyTrackCard[];
  searching: boolean;
  searchError: string | null;
  currentTrack: SpotifyTrackCard | null;
  lastPlayedTrack: SpotifyTrackCard | null;
  queue: SpotifyTrackCard[];
  history: SpotifyTrackCard[];
  playing: boolean;
  playbackMode: PlaybackMode;
  premiumAvailable: boolean | null;
  streamingScopeAvailable: boolean | null;
  playerNotice: string | null;
  /** Timestamp du dernier ajout réussi à la file (feedback UI bottom bar). */
  queueAddFlashAt: number;
  openPanel: (query?: string) => void;
  openPanelAndPlay: (query: string) => Promise<void>;
  closePanel: () => void;
  setSearchQuery: (query: string) => void;
  search: (query?: string) => Promise<void>;
  refreshPlayerConfig: (force?: boolean) => Promise<void>;
  playTrack: (track: SpotifyTrackCard, options?: PlayTrackOptions) => Promise<boolean>;
  addToQueue: (track: SpotifyTrackCard) => boolean;
  isTrackQueued: (trackId: string | undefined) => boolean;
  togglePlayback: () => void;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  handleTrackEnded: () => void;
  stop: () => void;
}

setSpotifyWebPlaybackListener((playing) => {
  const state = useSpotifyPlayerStore.getState();
  if (state.playbackMode === "full") {
    useSpotifyPlayerStore.setState({ playing });
    return;
  }
  // SDK may start full playback before the store leaves preview mode (Electron upgrade path).
  if (playing && state.currentTrack && state.playbackMode === "preview") {
    useSpotifyPlayerStore.setState({
      playing: true,
      playbackMode: "full",
      playerNotice: null,
    });
  }
});

setSpotifyWebPlaybackEndedListener(() => {
  // #region agent log
  fetch("http://127.0.0.1:7941/ingest/bf77dbb7-04a4-446f-817c-db0d19c43744", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c6d7b" },
    body: JSON.stringify({
      sessionId: "9c6d7b",
      runId: "dj-auto-next",
      hypothesisId: "C",
      location: "useSpotifyPlayerStore.ts:endedListener",
      message: "onPlaybackEnded received",
      data: {
        suppressTrackEnded,
        queueLen: useSpotifyPlayerStore.getState().queue.length,
        hallDj: useHallDjStore.getState().active,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (suppressTrackEnded) return;
  useSpotifyPlayerStore.getState().handleTrackEnded();
});

setSpotifyWebPlaybackErrorListener(() => {
  const track = useSpotifyPlayerStore.getState().currentTrack;
  void (async () => {
    suppressTrackEnded = true;
    try {
      await pauseSpotifyWebPlayback();
      if (track) {
        const heard = await playPreview(track, true);
        if (heard) {
          useSpotifyPlayerStore.setState({
            playing: true,
            playbackMode: "preview",
            playerNotice: hasFormaDesktop()
              ? "DRM Electron : signe Widevine (./scripts/sign-electron-widevine.sh) pour la lecture complète in-app. Extrait 30 s en attendant."
              : "Extrait 30 s.",
          });
          return;
        }
      }
      useSpotifyPlayerStore.setState({
        playing: false,
        playbackMode: null,
        playerNotice: hasFormaDesktop()
          ? "Lecture Spotify in-app bloquée (DRM). Lance ./scripts/sign-electron-widevine.sh puis relance Hall — comme le web."
          : "Lecture complète indisponible.",
      });
    } finally {
      suppressTrackEnded = false;
    }
  })();
});

function pausePreviewAudio() {
  sharedAudio?.pause();
}

async function playPreview(track: SpotifyTrackCard, restart = false): Promise<boolean> {
  const preview = track.previewUrl?.trim();
  if (!preview) return false;

  primeSpotifyPreviewAudio();
  primeSpotifyWebAudioUnlock();
  const audio = audioElement();
  await applyAudioOutputToElement(audio, readUserPreferences().audioOutputDeviceId);
  audio.src = preview;
  if (restart) {
    audio.currentTime = 0;
  }
  try {
    await audio.play();
    useSpotifyPlayerStore.setState({
      currentTrack: track,
      playing: true,
      playbackMode: "preview",
    });
    return true;
  } catch {
    return false;
  }
}

function spotifyPlayerNotice(config: {
  premium: boolean;
  reconnectRequired?: boolean;
  hasStreamingScope?: boolean;
}): string | null {
  if (config.reconnectRequired) {
    return "Spotify Premium détecté : déconnecte puis reconnecte le connecteur Spotify (Settings → Plugins) pour activer la lecture dans l'app.";
  }
  if (!config.premium) {
    return "Compte Spotify Free : extraits 30 s dans l'app quand disponibles. Spotify Premium + reconnexion du connecteur pour la piste complète.";
  }
  if (config.hasStreamingScope === false) {
    return "Reconnecte Spotify (Settings → Plugins) pour autoriser la lecture dans l'app.";
  }
  return null;
}

async function upgradePreviewToFullTrack(trackId: string): Promise<void> {
  const state = useSpotifyPlayerStore.getState();
  let premium = state.premiumAvailable;
  let streamingScope = state.streamingScopeAvailable;
  if (premium === null || streamingScope === null) {
    await state.refreshPlayerConfig();
    premium = useSpotifyPlayerStore.getState().premiumAvailable;
    streamingScope = useSpotifyPlayerStore.getState().streamingScopeAvailable;
  }
  if (!premium || streamingScope === false) return;

  warmSpotifyWebPlayer(true);
  void ensureSpotifyWebPlayer({ premiumHint: true });
  const ok = await playSpotifyFullTrack(trackId);
  if (!ok) return;
  useSpotifyPlayerStore.setState({
    playing: true,
    playbackMode: "full",
    playerNotice: null,
  });
  stopPreviewAudio({ silent: true });
}

async function startPlayback(track: SpotifyTrackCard, restart = false): Promise<boolean> {
  suppressTrackEnded = true;
  cancelSpotifyPlaybackEnded();
  const trackId = track.id?.trim();
  const preview = track.previewUrl?.trim();

  stopPreviewAudio();
  primeSpotifyWebAudioUnlock();
  useSpotifyPlayerStore.setState({
    currentTrack: track,
    playing: false,
    playbackMode: null,
    playerNotice: null,
  });

  try {
    if (preview) {
      const heard = await playPreview(track, restart);
      if (heard) {
        warmSpotifyWebPlayer(true);
        void ensureSpotifyWebPlayer({ premiumHint: true });
        if (trackId) void upgradePreviewToFullTrack(trackId);
        useSpotifyPlayerStore.setState({
          playerNotice: hasFormaDesktop()
            ? "Extrait 30 s — passage à la piste complète dès que le lecteur in-app est prêt."
            : null,
        });
        return true;
      }
    }

    let premium = useSpotifyPlayerStore.getState().premiumAvailable;
    let streamingScope = useSpotifyPlayerStore.getState().streamingScopeAvailable;
    if ((premium === null || streamingScope === null) && trackId) {
      try {
        await useSpotifyPlayerStore.getState().refreshPlayerConfig();
        premium = useSpotifyPlayerStore.getState().premiumAvailable;
        streamingScope = useSpotifyPlayerStore.getState().streamingScopeAvailable;
      } catch {
        premium = false;
        streamingScope = false;
      }
    } else if (premium && streamingScope !== false) {
      warmSpotifyWebPlayer(true);
      void ensureSpotifyWebPlayer({ premiumHint: true });
    }

    if (trackId && premium && streamingScope !== false) {
      stopPreviewAudio();
      const ok = await playSpotifyFullTrack(trackId);
      if (ok) {
        useSpotifyPlayerStore.setState({ playing: true, playbackMode: "full", playerNotice: null });
        return true;
      }
      useSpotifyPlayerStore.setState({
        playerNotice: hasFormaDesktop()
          ? "Lecture Spotify in-app bloquée (DRM Widevine). Lance ./scripts/sign-electron-widevine.sh puis relance Hall."
          : "Lecture complète indisponible. Déconnecte puis reconnecte Spotify dans Settings → Plugins.",
      });
    }

    useSpotifyPlayerStore.setState({
      playing: false,
      playbackMode: null,
      playerNotice: track.url
        ? "Pas d'extrait disponible ici. Utilise le lien ↗ sur la piste pour ouvrir Spotify."
        : "Impossible de lire cette piste dans l'app.",
    });
    return false;
  } finally {
    suppressTrackEnded = false;
  }
}

export const useSpotifyPlayerStore = create<SpotifyPlayerState>((set, get) => ({
  panelOpen: false,
  searchQuery: "",
  results: [],
  searching: false,
  searchError: null,
  currentTrack: null,
  lastPlayedTrack: null,
  queue: [],
  history: [],
  playing: false,
  playbackMode: null,
  premiumAvailable: storedPlayerConfig?.premiumAvailable ?? null,
  streamingScopeAvailable: storedPlayerConfig?.streamingScopeAvailable ?? null,
  playerNotice: null,
  queueAddFlashAt: 0,

  openPanel: (query) => {
    const trimmed = query?.trim() ?? "";
    set({ panelOpen: true, searchQuery: trimmed, searchError: null, playerNotice: null });
    void get().refreshPlayerConfig();
    if (trimmed) void get().search(trimmed);
  },

  openPanelAndPlay: async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      get().openPanel();
      set({ playerNotice: "Indiquez un titre ou un artiste." });
      return;
    }

    set({
      panelOpen: true,
      searchQuery: trimmed,
      searchError: null,
      playerNotice: null,
      searching: true,
    });
    await get().refreshPlayerConfig();
    await get().search(trimmed);

    const first = get().results[0];
    if (!first) {
      set({
        playerNotice: `Aucun résultat pour « ${trimmed} ».`,
        panelOpen: true,
      });
      return;
    }

    await get().playTrack(first);
    set({ panelOpen: false });
  },

  closePanel: () => set({ panelOpen: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  refreshPlayerConfig: async (force = false) => {
    const state = get();
    if (
      !force &&
      state.premiumAvailable !== null &&
      Date.now() - playerConfigRefreshedAt < PLAYER_CONFIG_TTL_MS
    ) {
      if (state.premiumAvailable && state.streamingScopeAvailable !== false) {
        warmSpotifyWebPlayer(true);
      }
      return;
    }
    if (playerConfigInflight) {
      await playerConfigInflight;
      return;
    }
    playerConfigInflight = (async () => {
      try {
        const config = await fetchSpotifyPlayerConfig();
        playerConfigRefreshedAt = Date.now();
        const streamingScope = config.hasStreamingScope !== false;
        writeStoredPlayerConfig(config.premium, streamingScope);
        set({
          premiumAvailable: config.premium,
          streamingScopeAvailable: streamingScope,
          playerNotice: spotifyPlayerNotice(config),
        });
        if (config.premium && config.hasStreamingScope !== false) warmSpotifyWebPlayer(true);
      } catch {
        set({ premiumAvailable: false, streamingScopeAvailable: false });
      }
    })();
    try {
      await playerConfigInflight;
    } finally {
      playerConfigInflight = null;
    }
  },

  search: async (query) => {
    const trimmed = (query ?? get().searchQuery).trim();
    if (!trimmed) {
      set({ results: [], searchError: null });
      return;
    }
    set({ searching: true, searchError: null, searchQuery: trimmed });
    try {
      const tracks = await searchSpotifyTracks(trimmed, 8);
      set({ results: tracks, searching: false });
    } catch (err) {
      set({
        searching: false,
        searchError: err instanceof Error ? err.message : "Recherche impossible.",
        results: [],
      });
    }
  },

  playTrack: async (track, options = {}) => {
    primeSpotifyPreviewAudio();
    primeSpotifyWebAudioUnlock();
    const state = get();
    const { restart = false, skipHistory = false } = options;

    if (
      !restart &&
      tracksEqual(state.currentTrack, track) &&
      state.playing
    ) {
      if (state.playbackMode === "full") {
        await pauseSpotifyWebPlayback();
      } else {
        pausePreviewAudio();
      }
      set({ playing: false });
      return true;
    }

    if (!skipHistory && state.currentTrack && state.playing && !tracksEqual(state.currentTrack, track)) {
      set((s) => ({
        history: [...s.history, s.currentTrack!],
        lastPlayedTrack: s.currentTrack,
      }));
    }

    const ok = await startPlayback(track, restart);
    recordHallDjPlay(track);
    set({ lastPlayedTrack: track });
    return ok;
  },

  addToQueue: (track) => {
    const { queue, currentTrack, playing, playbackMode } = get();
    if (tracksEqual(currentTrack, track) && playing) return false;
    if (queue.some((entry) => tracksEqual(entry, track))) return false;

    const idleAfterEnd = !playing && playbackMode === null && queue.length === 0;
    if (idleAfterEnd) {
      void get().playTrack(track, { skipHistory: true });
      set({ queueAddFlashAt: Date.now() });
      return true;
    }

    set({ queue: [...queue, track], queueAddFlashAt: Date.now() });
    return true;
  },

  isTrackQueued: (trackId) => {
    if (!trackId) return false;
    return get().queue.some((entry) => entry.id === trackId);
  },

  togglePlayback: () => {
    primeSpotifyPreviewAudio();
    primeSpotifyWebAudioUnlock();
    const { currentTrack, lastPlayedTrack, playing, playbackMode } = get();
    const track = currentTrack ?? lastPlayedTrack;
    if (!track) return;

    if (!playing && playbackMode === null) {
      void get().playTrack(track, { restart: true, skipHistory: true });
      return;
    }

    if (playbackMode === "full") {
      if (playing) {
        void pauseSpotifyWebPlayback();
      } else {
        void resumeSpotifyWebPlayback();
      }
      return;
    }

    if (playing) {
      pausePreviewAudio();
      set({ playing: false });
      return;
    }

    if (track.previewUrl?.trim()) {
      void playPreview(track, false);
    }
  },

  skipNext: async () => {
    const { queue, currentTrack, lastPlayedTrack } = get();
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      if (currentTrack && get().playing) {
        set((s) => ({
          history: [...s.history, s.currentTrack!],
          lastPlayedTrack: s.currentTrack,
          queue: rest,
        }));
      } else {
        set({ queue: rest });
      }
      await get().playTrack(next, { skipHistory: true });
      return;
    }

    const replay = currentTrack ?? lastPlayedTrack;
    if (!replay) return;
    await get().playTrack(replay, { restart: true, skipHistory: true });
  },

  skipPrevious: async () => {
    const { history, currentTrack, queue, playing } = get();
    if (history.length === 0) return;

    const previous = history[history.length - 1];
    const nextHistory = history.slice(0, -1);
    const nextQueue =
      currentTrack && (playing || queue.length > 0)
        ? [currentTrack, ...queue.filter((entry) => !tracksEqual(entry, currentTrack))]
        : queue;

    set({ history: nextHistory, queue: nextQueue });
    await get().playTrack(previous, { skipHistory: true });
  },

  handleTrackEnded: () => {
    // #region agent log
    fetch("http://127.0.0.1:7941/ingest/bf77dbb7-04a4-446f-817c-db0d19c43744", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c6d7b" },
      body: JSON.stringify({
        sessionId: "9c6d7b",
        runId: "dj-auto-next",
        hypothesisId: "C",
        location: "useSpotifyPlayerStore.ts:handleTrackEnded",
        message: "handleTrackEnded",
        data: {
          suppressTrackEnded,
          handlingTrackEnded,
          queueLen: get().queue.length,
          trackId: get().currentTrack?.id ?? null,
          playbackMode: get().playbackMode,
          hallDj: useHallDjStore.getState().active,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (suppressTrackEnded || handlingTrackEnded) return;
    handlingTrackEnded = true;
    cancelSpotifyPlaybackEnded();

    void (async () => {
      try {
        // Hall DJ: same action as the Next button.
        const hallDj = useHallDjStore.getState();
        if (hallDj.active) {
          await hallDj.skipNext();
          return;
        }

        const { queue, currentTrack } = get();
        if (currentTrack) {
          set((s) => ({
            lastPlayedTrack: currentTrack,
            history: [...s.history, currentTrack],
            playing: false,
          }));
        }

        if (queue.length === 0) {
          set({ playing: false, playbackMode: null });
          return;
        }

        const [next, ...rest] = queue;
        set({ queue: rest });
        await get().playTrack(next, { skipHistory: true, restart: true });
      } finally {
        handlingTrackEnded = false;
      }
    })();
  },

  stop: () => {
    stopPreviewAudio();
    void pauseSpotifyWebPlayback();
    useHallDjStore.getState().stopDj();
    set({
      playing: false,
      currentTrack: null,
      playbackMode: null,
      panelOpen: false,
      queue: [],
      history: [],
      lastPlayedTrack: null,
    });
  },
}));
