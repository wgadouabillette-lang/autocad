import { create } from "zustand";
import {
  fetchSpotifyPlayerConfig,
  searchSpotifyTracks,
  type SpotifyTrackCard,
} from "../lib/connectorsApi";
import {
  cancelSpotifyPlaybackEnded,
  pauseSpotifyWebPlayback,
  playSpotifyFullTrack,
  primeSpotifyWebAudioUnlock,
  resumeSpotifyWebPlayback,
  setSpotifyWebPlaybackEndedListener,
  setSpotifyWebPlaybackListener,
  warmSpotifyWebPlayer,
} from "../lib/spotifyWebPlayback";
import { primeSpotifyPreviewAudio } from "../lib/spotifyAudioPulse";
import { applyAudioOutputToElement } from "../lib/audioDevices";
import { recordHallDjPlay } from "../lib/hallDjPlayHistory";
import { readUserPreferences } from "../lib/userPreferences";
import { useHallDjStore } from "./useHallDjStore";

let sharedAudio: HTMLAudioElement | null = null;

function tracksEqual(a: SpotifyTrackCard | null | undefined, b: SpotifyTrackCard | null | undefined) {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  return a.name === b.name && a.artists === b.artists;
}

let suppressTrackEnded = false;

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
      const state = useSpotifyPlayerStore.getState();
      if (state.playbackMode === "preview" && !sharedAudio?.ended) {
        useSpotifyPlayerStore.setState({ playing: false });
      }
    });
  }
  return sharedAudio;
}

function stopPreviewAudio() {
  const audio = sharedAudio;
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
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
  refreshPlayerConfig: () => Promise<void>;
  playTrack: (track: SpotifyTrackCard, options?: PlayTrackOptions) => Promise<void>;
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
  }
});

setSpotifyWebPlaybackEndedListener(() => {
  if (suppressTrackEnded) return;
  useSpotifyPlayerStore.getState().handleTrackEnded();
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

async function startPlayback(track: SpotifyTrackCard, restart = false): Promise<void> {
  suppressTrackEnded = true;
  cancelSpotifyPlaybackEnded();
  const trackId = track.id?.trim();
  const preview = track.previewUrl?.trim();
  const wasPlayingFull =
    useSpotifyPlayerStore.getState().playing &&
    useSpotifyPlayerStore.getState().playbackMode === "full";

  stopPreviewAudio();
  primeSpotifyWebAudioUnlock();
  useSpotifyPlayerStore.setState({
    currentTrack: track,
    playing: false,
    playbackMode: null,
    playerNotice: null,
  });

  try {
    let premium = useSpotifyPlayerStore.getState().premiumAvailable;
    let streamingScope = useSpotifyPlayerStore.getState().streamingScopeAvailable;
    if ((premium === null || streamingScope === null) && trackId) {
      try {
        const config = await fetchSpotifyPlayerConfig();
        premium = config.premium;
        streamingScope = config.hasStreamingScope !== false;
        useSpotifyPlayerStore.setState({
          premiumAvailable: config.premium,
          streamingScopeAvailable: config.hasStreamingScope !== false,
          playerNotice: spotifyPlayerNotice(config),
        });
        if (config.premium && config.hasStreamingScope !== false) warmSpotifyWebPlayer(true);
      } catch {
        premium = false;
        streamingScope = false;
      }
    } else if (premium && streamingScope !== false) {
      warmSpotifyWebPlayer(true);
    }

    if (trackId && premium && streamingScope !== false) {
      if (wasPlayingFull) {
        await pauseSpotifyWebPlayback();
      }
      stopPreviewAudio();
      const ok = await playSpotifyFullTrack(trackId);
      if (ok) {
        useSpotifyPlayerStore.setState({ playing: true, playbackMode: "full", playerNotice: null });
        return;
      }
      if (preview) {
        const heard = await playPreview(track, restart);
        if (heard) {
          useSpotifyPlayerStore.setState({
            playerNotice: "Lecture complète indisponible — extrait 30 s.",
          });
          return;
        }
      }
      useSpotifyPlayerStore.setState({
        playerNotice:
          "Lecture complète indisponible. Déconnecte puis reconnecte Spotify dans Settings → Plugins (autorisation streaming).",
      });
    }

    if (preview) {
      if (wasPlayingFull) {
        await pauseSpotifyWebPlayback();
      }
      const heard = await playPreview(track, restart);
      if (heard) return;
    }

    useSpotifyPlayerStore.setState({
      playing: false,
      playbackMode: null,
      playerNotice: track.url
        ? "Pas d'extrait disponible ici. Utilise le lien ↗ sur la piste pour ouvrir Spotify."
        : "Impossible de lire cette piste dans l'app.",
    });
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
  premiumAvailable: null,
  streamingScopeAvailable: null,
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

  refreshPlayerConfig: async () => {
    try {
      const config = await fetchSpotifyPlayerConfig();
      set({
        premiumAvailable: config.premium,
        streamingScopeAvailable: config.hasStreamingScope !== false,
        playerNotice: spotifyPlayerNotice(config),
      });
      if (config.premium && config.hasStreamingScope !== false) warmSpotifyWebPlayer(true);
    } catch {
      set({ premiumAvailable: false, streamingScopeAvailable: false });
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
      return;
    }

    if (!skipHistory && state.currentTrack && state.playing && !tracksEqual(state.currentTrack, track)) {
      set((s) => ({
        history: [...s.history, s.currentTrack!],
        lastPlayedTrack: s.currentTrack,
      }));
    }

    await startPlayback(track, restart);
    recordHallDjPlay(track);
    set({ lastPlayedTrack: track });
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
    if (suppressTrackEnded) return;
    cancelSpotifyPlaybackEnded();

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
      void useHallDjStore.getState().refillIfNeeded();
      return;
    }

    const [next, ...rest] = queue;
    set({ queue: rest });
    void get().playTrack(next, { skipHistory: true, restart: true });
    void useHallDjStore.getState().refillIfNeeded();
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
