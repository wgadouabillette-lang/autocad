import { create } from "zustand";
import { searchSpotifyTracks, type SpotifyTrackCard } from "../lib/connectorsApi";

let sharedAudio: HTMLAudioElement | null = null;

function audioElement(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "none";
    sharedAudio.addEventListener("ended", () => {
      useSpotifyPlayerStore.setState({ playing: false });
    });
    sharedAudio.addEventListener("pause", () => {
      useSpotifyPlayerStore.setState({ playing: false });
    });
  }
  return sharedAudio;
}

interface SpotifyPlayerState {
  panelOpen: boolean;
  searchQuery: string;
  results: SpotifyTrackCard[];
  searching: boolean;
  searchError: string | null;
  currentTrack: SpotifyTrackCard | null;
  playing: boolean;
  openPanel: (query?: string) => void;
  closePanel: () => void;
  setSearchQuery: (query: string) => void;
  search: (query?: string) => Promise<void>;
  playTrack: (track: SpotifyTrackCard) => Promise<void>;
  togglePlayback: () => void;
  stop: () => void;
}

export const useSpotifyPlayerStore = create<SpotifyPlayerState>((set, get) => ({
  panelOpen: false,
  searchQuery: "",
  results: [],
  searching: false,
  searchError: null,
  currentTrack: null,
  playing: false,

  openPanel: (query) => {
    const trimmed = query?.trim() ?? "";
    set({ panelOpen: true, searchQuery: trimmed, searchError: null });
    if (trimmed) void get().search(trimmed);
  },

  closePanel: () => set({ panelOpen: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

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
    const preview = track.previewUrl?.trim();
    const audio = audioElement();
    const state = get();

    if (state.currentTrack?.id === track.id && state.playing) {
      audio.pause();
      set({ playing: false });
      return;
    }

    if (!preview) {
      if (track.url) window.open(track.url, "_blank", "noopener,noreferrer");
      set({ currentTrack: track, playing: false });
      return;
    }

    audio.src = preview;
    audio.currentTime = 0;
    try {
      await audio.play();
      set({ currentTrack: track, playing: true });
    } catch {
      set({ currentTrack: track, playing: false });
    }
  },

  togglePlayback: () => {
    const { currentTrack, playing } = get();
    if (!currentTrack) return;
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
    const audio = audioElement();
    audio.pause();
    audio.currentTime = 0;
    set({ playing: false, currentTrack: null });
  },
}));
