import { create } from "zustand";
import {
  fetchSpotifyPlayerConfig,
  searchSpotifyTracks,
  type SpotifyTrackCard,
} from "../lib/connectorsApi";
import {
  pauseSpotifyWebPlayback,
  playSpotifyFullTrack,
  primeSpotifyWebAudioUnlock,
  setSpotifyWebPlaybackListener,
  toggleSpotifyWebPlayback,
} from "../lib/spotifyWebPlayback";

let sharedAudio: HTMLAudioElement | null = null;

function audioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    sharedAudio.addEventListener("ended", () => {
      const state = useSpotifyPlayerStore.getState();
      if (state.playbackMode === "preview") {
        useSpotifyPlayerStore.setState({ playing: false });
      }
    });
    sharedAudio.addEventListener("pause", () => {
      const state = useSpotifyPlayerStore.getState();
      if (state.playbackMode === "preview") {
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

type PlaybackMode = "full" | "preview" | null;

interface SpotifyPlayerState {
  panelOpen: boolean;
  searchQuery: string;
  results: SpotifyTrackCard[];
  searching: boolean;
  searchError: string | null;
  currentTrack: SpotifyTrackCard | null;
  playing: boolean;
  playbackMode: PlaybackMode;
  premiumAvailable: boolean | null;
  playerNotice: string | null;
  openPanel: (query?: string) => void;
  closePanel: () => void;
  setSearchQuery: (query: string) => void;
  search: (query?: string) => Promise<void>;
  refreshPlayerConfig: () => Promise<void>;
  playTrack: (track: SpotifyTrackCard) => Promise<void>;
  togglePlayback: () => void;
  stop: () => void;
}

setSpotifyWebPlaybackListener((playing) => {
  const state = useSpotifyPlayerStore.getState();
  if (state.playbackMode === "full") {
    useSpotifyPlayerStore.setState({ playing });
  }
});

async function playPreview(track: SpotifyTrackCard): Promise<boolean> {
  const preview = track.previewUrl?.trim();
  if (!preview) return false;

  const audio = audioElement();
  audio.src = preview;
  audio.currentTime = 0;
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

export const useSpotifyPlayerStore = create<SpotifyPlayerState>((set, get) => ({
  panelOpen: false,
  searchQuery: "",
  results: [],
  searching: false,
  searchError: null,
  currentTrack: null,
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

  playTrack: async (track) => {
    const state = get();
    const trackId = track.id?.trim();
    const preview = track.previewUrl?.trim();

    if (state.currentTrack?.id === track.id && state.playing) {
      if (state.playbackMode === "full") {
        await pauseSpotifyWebPlayback();
      } else {
        stopPreviewAudio();
      }
      set({ playing: false });
      return;
    }

    stopPreviewAudio();
    void pauseSpotifyWebPlayback();
    primeSpotifyWebAudioUnlock();
    set({ currentTrack: track, playing: false, playbackMode: null, playerNotice: null });

    let heard = false;

    if (preview) {
      heard = await playPreview(track);
    }

    if (trackId) {
      try {
        const config = await fetchSpotifyPlayerConfig();
        set({ premiumAvailable: config.premium });
        if (config.premium) {
          const ok = await playSpotifyFullTrack(trackId);
          if (ok) {
            stopPreviewAudio();
            set({ playing: true, playbackMode: "full", playerNotice: null });
            return;
          }
          if (!heard) {
            set({
              playerNotice:
                "Lecture complète indisponible. Déconnecte puis reconnecte Spotify (scope streaming).",
            });
          }
        }
      } catch {
        // preview already playing if available
      }
    }

    if (heard) return;

    set({
      playing: false,
      playbackMode: null,
      playerNotice: track.url
        ? "Pas d'extrait disponible ici. Utilise le lien ↗ sur la piste pour ouvrir Spotify."
        : "Impossible de lire cette piste dans l'app.",
    });
  },

  togglePlayback: () => {
    const { currentTrack, playing, playbackMode } = get();
    if (!currentTrack) return;

    if (playbackMode === "full") {
      void toggleSpotifyWebPlayback();
      return;
    }

    const audio = audioElement();
    if (playing) {
      audio.pause();
      set({ playing: false });
      return;
    }
    if (currentTrack.previewUrl?.trim()) {
      void audio.play().then(() => set({ playing: true })).catch(() => set({ playing: false }));
    }
  },

  stop: () => {
    stopPreviewAudio();
    void pauseSpotifyWebPlayback();
    set({ playing: false, currentTrack: null, playbackMode: null });
  },
}));
