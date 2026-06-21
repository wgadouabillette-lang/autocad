import { create } from "zustand";
import type { VoicePoll } from "../lib/voicePoll";
import { closePanelsOnSide } from "../lib/bottomPanelCoordination";
import {
  finalizeNotifications,
  loadPersistedNotifications,
  markNotificationSeen,
  markNotificationsSeen,
} from "../lib/notificationsPersistence";

export type NotificationKind =
  | "friend_request"
  | "message"
  | "new_feature"
  | "app_update"
  | "subscription"
  | "renewal"
  | "poll"
  | "workspace"
  | "recording"
  | "meeting";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  category?: string;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  friendRequestId?: string;
  messageThreadId?: string;
  messagePersonId?: string;
  messagePersonName?: string;
  pollWorkspaceId?: string;
  pollSnapshot?: VoicePoll;
  updateVersion?: string;
  updateReleaseNotes?: string;
  recordingSessionId?: string;
}

export interface FriendRequestNotificationInput {
  id: string;
  friendRequestId: string;
  title: string;
  body: string;
  createdAt: number;
}

interface NotificationsState {
  items: AppNotification[];
  panelOpen: boolean;
  /** Increments on each panel open to replay the pop-up animation. */
  panelOpenGeneration: number;
  currentIndex: number;
  persistedEmail: string | null;
  unreadCount: () => number;
  hydrate: (email: string | null) => void;
  syncFriendRequests: (requests: FriendRequestNotificationInput[]) => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  push: (
    item: Omit<AppNotification, "id" | "createdAt" | "read"> & { id?: string },
    options?: { openPanel?: boolean },
  ) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  nextNotification: () => void;
  prevNotification: () => void;
}

function firstUnreadIndex(items: AppNotification[]): number {
  const idx = items.findIndex((n) => !n.read);
  return idx >= 0 ? idx : 0;
}

function commitItems(
  email: string | null,
  items: AppNotification[],
): AppNotification[] {
  return finalizeNotifications(email, items);
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  panelOpen: false,
  panelOpenGeneration: 0,
  currentIndex: 0,
  persistedEmail: null,

  unreadCount: () => get().items.filter((n) => !n.read).length,

  hydrate: (email) => {
    const items = finalizeNotifications(email, loadPersistedNotifications(email));
    set({
      persistedEmail: email,
      items,
      currentIndex: firstUnreadIndex(items),
      panelOpen: false,
    });
  },

  syncFriendRequests: (requests) =>
    set((s) => {
      const activeRequestIds = new Set(requests.map((request) => request.friendRequestId));
      const existingByRequestId = new Map(
        s.items
          .filter((item) => item.kind === "friend_request" && item.friendRequestId)
          .map((item) => [item.friendRequestId!, item]),
      );
      const friendNotifications: AppNotification[] = requests.map((request) => {
        const existing = existingByRequestId.get(request.friendRequestId);
        return {
          id: request.id,
          kind: "friend_request",
          category: "Team",
          title: request.title,
          body: request.body,
          createdAt: existing?.createdAt ?? request.createdAt,
          read: false,
          friendRequestId: request.friendRequestId,
        };
      });
      const otherItems = s.items.filter(
        (item) =>
          item.kind !== "friend_request" ||
          !item.friendRequestId ||
          activeRequestIds.has(item.friendRequestId),
      );
      const otherNonFriendItems = otherItems.filter((item) => item.kind !== "friend_request");
      const items = commitItems(s.persistedEmail, [
        ...friendNotifications,
        ...otherNonFriendItems,
      ]);
      return {
        items,
        currentIndex: firstUnreadIndex(items),
        panelOpen: items.length > 0 ? s.panelOpen : false,
      };
    }),

  togglePanel: () => {
    const { panelOpen, items, panelOpenGeneration } = get();
    if (!panelOpen && items.length === 0) return;
    const next = !panelOpen;
    if (next) {
      closePanelsOnSide("left", "notifications");
      set({
        panelOpen: true,
        currentIndex: firstUnreadIndex(items),
        panelOpenGeneration: panelOpenGeneration + 1,
      });
      return;
    }
    set({ panelOpen: false });
  },

  openPanel: () => {
    closePanelsOnSide("left", "notifications");
    const { items, panelOpenGeneration } = get();
    set({
      panelOpen: true,
      currentIndex: firstUnreadIndex(items),
      panelOpenGeneration: panelOpenGeneration + 1,
    });
  },

  closePanel: () => set({ panelOpen: false }),

  push: (item, options) =>
    set((s) => {
      const { id: stableId, ...rest } = item;
      const id = stableId ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (s.items.some((existing) => existing.id === id)) {
        return s;
      }
      const items = commitItems(s.persistedEmail, [
        {
          ...rest,
          id,
          createdAt: Date.now(),
          read: false,
        },
        ...s.items,
      ]);
      const next = { items, currentIndex: 0 };
      if (options?.openPanel && items.length > 0) {
        closePanelsOnSide("left", "notifications");
        return {
          ...next,
          panelOpen: true,
          panelOpenGeneration: s.panelOpenGeneration + 1,
        };
      }
      return next;
    }),

  markRead: (id) =>
    set((s) => {
      markNotificationSeen(s.persistedEmail, id);
      const items = finalizeNotifications(
        s.persistedEmail,
        s.items.filter((n) => n.id !== id),
      );
      const nextIndex =
        items.length === 0 ? 0 : Math.min(s.currentIndex, items.length - 1);
      return { items, currentIndex: nextIndex };
    }),

  markAllRead: () =>
    set((s) => {
      const dismissable = s.items.filter((n) => n.kind !== "friend_request");
      const persistent = s.items.filter((n) => n.kind === "friend_request");
      markNotificationsSeen(
        s.persistedEmail,
        dismissable.map((n) => n.id),
      );
      const items = finalizeNotifications(s.persistedEmail, persistent);
      return { items, currentIndex: firstUnreadIndex(items) };
    }),

  removeNotification: (id) =>
    set((s) => {
      markNotificationSeen(s.persistedEmail, id);
      const items = finalizeNotifications(
        s.persistedEmail,
        s.items.filter((n) => n.id !== id),
      );
      const nextIndex =
        items.length === 0 ? 0 : Math.min(s.currentIndex, items.length - 1);
      return {
        items,
        currentIndex: nextIndex,
        panelOpen: items.length > 0 ? s.panelOpen : false,
      };
    }),

  nextNotification: () => {
    const { items, currentIndex } = get();
    if (items.length === 0) return;
    set({ currentIndex: (currentIndex + 1) % items.length });
  },

  prevNotification: () => {
    const { items, currentIndex } = get();
    if (items.length === 0) return;
    set({ currentIndex: (currentIndex - 1 + items.length) % items.length });
  },
}));
