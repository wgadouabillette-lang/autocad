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
  playerNotice: string | null;
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
    if (premium === null && trackId) {
      try {
        const config = await fetchSpotifyPlayerConfig();
        premium = config.premium;
        useSpotifyPlayerStore.setState({ premiumAvailable: config.premium });
        if (config.premium) warmSpotifyWebPlayer(true);
      } catch {
        premium = false;
      }
    } else if (premium) {
      warmSpotifyWebPlayer(true);
    }

    if (trackId && premium) {
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
          "Lecture complète indisponible. Déconnecte puis reconnecte Spotify (scope streaming).",
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
  playerNotice: null,

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
        playerNotice: config.premium
          ? null
          : "Compte Spotify Free : extraits 30 s uniquement. Premium + reconnexion du connecteur pour la piste complète.",
      });
      if (config.premium) warmSpotifyWebPlayer(true);
    } catch {
      set({ premiumAvailable: false });
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
    set({ lastPlayedTrack: track });
  },

  addToQueue: (track) => {
    const { queue, currentTrack, playing, playbackMode } = get();
    if (tracksEqual(currentTrack, track) && playing) return false;
    if (queue.some((entry) => tracksEqual(entry, track))) return false;

    const idleAfterEnd = !playing && playbackMode === null && queue.length === 0;
    if (idleAfterEnd) {
      void get().playTrack(track, { skipHistory: true });
      return true;
    }

    set({ queue: [...queue, track] });
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
    void get().playTrack(next, { skipHistory: true });
  },

  stop: () => {
    stopPreviewAudio();
    void pauseSpotifyWebPlayback();
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
