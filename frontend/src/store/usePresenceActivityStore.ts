import { create } from "zustand";
import {
  getPresenceActivityOption,
  mockPresenceActivityForUser,
  presenceActivityKey,
  type PresenceActivityId,
} from "../lib/presenceActivity";

interface PresenceActivityState {
  byKey: Record<string, PresenceActivityId>;
  getActivity: (roomId: string, userId: string, isLocal?: boolean) => PresenceActivityId;
  setActivity: (roomId: string, userId: string, activity: PresenceActivityId) => void;
}

export const usePresenceActivityStore = create<PresenceActivityState>((set, get) => ({
  byKey: {},

  getActivity: (roomId, userId, isLocal = false) => {
    const key = presenceActivityKey(roomId, userId);
    const stored = get().byKey[key];
    if (stored) return stored;
    if (isLocal) return "none";
    return mockPresenceActivityForUser(userId);
  },

  setActivity: (roomId, userId, activity) => {
    const key = presenceActivityKey(roomId, userId);
    set((state) => ({
      byKey: { ...state.byKey, [key]: activity },
    }));
  },
}));

export { getPresenceActivityOption };
