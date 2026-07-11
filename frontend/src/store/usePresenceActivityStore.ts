import { create } from "zustand";
import {
  getPresenceActivityOption,
  mockPresenceActivityForUser,
  presenceActivityKey,
  type PresenceActivityId,
} from "../lib/presenceActivity";
import type { SpotifyNowPlayingSnapshot } from "../lib/spotifyNowPlaying";

interface PresenceActivityState {
  byKey: Record<string, PresenceActivityId>;
  spotifyNowPlayingByKey: Record<string, SpotifyNowPlayingSnapshot>;
  getActivity: (roomId: string, userId: string, isLocal?: boolean) => PresenceActivityId;
  getSpotifyNowPlaying: (roomId: string, userId: string) => SpotifyNowPlayingSnapshot | null;
  setActivity: (roomId: string, userId: string, activity: PresenceActivityId) => void;
  syncRemoteActivity: (roomId: string, userId: string, activity: PresenceActivityId | null) => void;
  syncRemoteSpotifyNowPlaying: (
    roomId: string,
    userId: string,
    snapshot: SpotifyNowPlayingSnapshot | null,
  ) => void;
}

export const usePresenceActivityStore = create<PresenceActivityState>((set, get) => ({
  byKey: {},
  spotifyNowPlayingByKey: {},

  getActivity: (roomId, userId, isLocal = false) => {
    const key = presenceActivityKey(roomId, userId);
    const stored = get().byKey[key];
    if (stored) return stored;
    if (isLocal) return "none";
    return mockPresenceActivityForUser(userId);
  },

  getSpotifyNowPlaying: (roomId, userId) => {
    const key = presenceActivityKey(roomId, userId);
    return get().spotifyNowPlayingByKey[key] ?? null;
  },

  setActivity: (roomId, userId, activity) => {
    const key = presenceActivityKey(roomId, userId);
    set((state) => ({
      byKey: { ...state.byKey, [key]: activity },
    }));
  },

  syncRemoteActivity: (roomId, userId, activity) => {
    const key = presenceActivityKey(roomId, userId);
    if (!activity || activity === "none") {
      set((state) => {
        const hasActivity = key in state.byKey;
        const hasNowPlaying = key in state.spotifyNowPlayingByKey;
        if (!hasActivity && !hasNowPlaying) return state;
        const byKey = { ...state.byKey };
        const spotifyNowPlayingByKey = { ...state.spotifyNowPlayingByKey };
        delete byKey[key];
        delete spotifyNowPlayingByKey[key];
        return { byKey, spotifyNowPlayingByKey };
      });
      return;
    }
    set((state) => ({
      byKey: { ...state.byKey, [key]: activity },
    }));
  },

  syncRemoteSpotifyNowPlaying: (roomId, userId, snapshot) => {
    const key = presenceActivityKey(roomId, userId);
    const label = snapshot?.label?.trim();
    if (!label || !snapshot) {
      set((state) => {
        if (!(key in state.spotifyNowPlayingByKey)) return state;
        const spotifyNowPlayingByKey = { ...state.spotifyNowPlayingByKey };
        delete spotifyNowPlayingByKey[key];
        return { spotifyNowPlayingByKey };
      });
      return;
    }
    set((state) => ({
      spotifyNowPlayingByKey: {
        ...state.spotifyNowPlayingByKey,
        [key]: {
          label,
          imageUrl: snapshot.imageUrl?.trim() || null,
        },
      },
    }));
  },
}));

export { getPresenceActivityOption };
