import clsx from "clsx";
import { ArrowUpRight, X } from "lucide-react";
import { useCallback, useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  useNotificationsStore,
  type AppNotification,
  type NotificationKind,
} from "../../store/useNotificationsStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useVoicePollStore } from "../../store/useVoicePollStore";
import { hasFormaDesktop } from "../../lib/formaDesktop";
import { useStore } from "../../store/useStore";

const PANEL_WIDTH = 268; // 16.75rem
const PANEL_HEIGHT = 288; // 18rem
const PANEL_GAP_PX = 18; // 0.5rem - overlay offset + 15px raise

const DEFAULT_CATEGORY: Record<NotificationKind, string> = {
  onboarding: "Product overview",
  new_feature: "Update available",
  app_update: "Mise à jour",
  friend_request: "Team",
  subscription: "Billing",
  renewal: "Renewal",
  connector: "Integration",
  poll: "Group poll",
};

const VISUAL_BY_TITLE: Record<string, string> = {
  "Connect your Calendar": "notifications-panel__visual--calendar",
  "Invite your colleague": "notifications-panel__visual--invite",
  "Record your screen": "notifications-panel__visual--record",
  "Generate Follow-ups": "notifications-panel__visual--followups",
  "Generate meeting notes": "notifications-panel__visual--notes",
};

const VISUAL_BY_KIND: Record<NotificationKind, string> = {
  onboarding: "notifications-panel__visual--onboarding",
  new_feature: "notifications-panel__visual--feature",
  app_update: "notifications-panel__visual--feature",
  friend_request: "notifications-panel__visual--friend",
  subscription: "notifications-panel__visual--subscription",
  renewal: "notifications-panel__visual--renewal",
  connector: "notifications-panel__visual--connector",
  poll: "notifications-panel__visual--feature",
};

interface PanelPosition {
  left: number;
  bottom: number;
}

function notificationCategory(item: AppNotification): string {
  return item.category?.trim() || DEFAULT_CATEGORY[item.kind];
}

function notificationVisualClass(item: AppNotification): string {
  return VISUAL_BY_TITLE[item.title] ?? VISUAL_BY_KIND[item.kind];
}

interface NotificationsPanelProps {
  anchorRef: RefObject<HTMLElement | null>;
}

export default function NotificationsPanel({ anchorRef }: NotificationsPanelProps) {
  const items = useNotificationsStore((s) => s.items);
  const panelOpen = useNotificationsStore((s) => s.panelOpen);
  const currentIndex = useNotificationsStore((s) => s.currentIndex);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const removeNotification = useNotificationsStore((s) => s.removeNotification);
  const closePanel = useNotificationsStore((s) => s.closePanel);
  const nextNotification = useNotificationsStore((s) => s.nextNotification);
  const acceptFriendRequest = usePeopleStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = usePeopleStore((s) => s.declineFriendRequest);
  const workspaceId = useStore((s) => s.activeRoomId);
  const openPollVotePanel = useVoicePollStore((s) => s.openVotePanel);
  const ingestPoll = useVoicePollStore((s) => s.ingestPoll);
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState(false);

  const updatePanelPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left - 4, window.innerWidth - PANEL_WIDTH - 8));
    const bottom = window.innerHeight - rect.top + PANEL_GAP_PX;
    setPanelPos({ left, bottom });
  }, [anchorRef]);

  useEffect(() => {
    if (!panelOpen) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    const onLayout = () => updatePanelPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [panelOpen, updatePanelPosition]);

  if (!panelOpen || !panelPos) return null;

  const item = items[currentIndex];
  const isLast = currentIndex >= items.length - 1;

  const handleNext = () => {
    if (!item) return;
    markRead(item.id);
    if (item.kind === "poll") {
      if (item.pollSnapshot) {
        ingestPoll(item.pollSnapshot);
      }
      openPollVotePanel(item.pollWorkspaceId ?? workspaceId);
    }
    if (isLast) {
      closePanel();
      return;
    }
    nextNotification();
  };

  const handleDismissAll = () => {
    markAllRead();
    closePanel();
  };

  const handleFriendRequestAccept = async () => {
    if (!item?.friendRequestId || friendActionBusy) return;
    setFriendActionBusy(true);
    try {
      await acceptFriendRequest(item.friendRequestId);
      removeNotification(item.id);
    } finally {
      setFriendActionBusy(false);
    }
  };

  const handleFriendRequestDecline = async () => {
    if (!item?.friendRequestId || friendActionBusy) return;
    setFriendActionBusy(true);
    try {
      await declineFriendRequest(item.friendRequestId);
      removeNotification(item.id);
    } finally {
      setFriendActionBusy(false);
    }
  };

  const handleInstallUpdateNow = async () => {
    if (!item || item.kind !== "app_update" || updateBusy) return;
    if (!hasFormaDesktop() || !window.formaDesktop?.installUpdateNow) return;
    setUpdateBusy(true);
    try {
      await window.formaDesktop.installUpdateNow();
      removeNotification(item.id);
    } finally {
      setUpdateBusy(false);
    }
  };

  const handleScheduleUpdateTonight = async () => {
    if (!item || item.kind !== "app_update" || updateBusy) return;
    if (!hasFormaDesktop() || !window.formaDesktop?.scheduleUpdateTonight) return;
    setUpdateBusy(true);
    try {
      const result = await window.formaDesktop.scheduleUpdateTonight();
      if (result.ok) {
        removeNotification(item.id);
      }
    } finally {
      setUpdateBusy(false);
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        className="bottom-overlay__backdrop bottom-overlay__backdrop--left"
        aria-label="Fermer les notifications"
        onClick={closePanel}
      />
      <div
        className="notifications-panel notifications-panel--floating notifications-panel--popup-left"
        role="dialog"
        aria-label="Notifications"
        style={{
          left: panelPos.left,
          bottom: panelPos.bottom,
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
        }}
      >
        <button
          type="button"
          className="notifications-panel__close"
          aria-label="Fermer toutes les notifications"
          onClick={handleDismissAll}
        >
          <X size={13} strokeWidth={2.25} aria-hidden />
        </button>

        {items.length === 0 || !item ? (
          <p className="notifications-panel__empty-state">Aucune notification pour le moment.</p>
        ) : (
          <article
            className={clsx(
              "notifications-panel__feature",
              !item.read && "notifications-panel__feature--unread",
            )}
          >
            <div
              className={clsx("notifications-panel__visual", notificationVisualClass(item))}
              aria-hidden
            />

            <div className="notifications-panel__content">
              <div className="notifications-panel__copy">
                <p className="notifications-panel__category">{notificationCategory(item)}</p>
                <h3 className="notifications-panel__title">{item.title}</h3>
                <p className="notifications-panel__description">{item.body}</p>
              </div>
              <div
                className={clsx(
                  "notifications-panel__actions",
                  (item.kind === "friend_request" || item.kind === "app_update") &&
                    "notifications-panel__actions--split",
                )}
              >
                {item.kind === "app_update" ? (
                  <>
                    <button
                      type="button"
                      className="chat-connectors-row__connect"
                      disabled={updateBusy}
                      onClick={() => void handleScheduleUpdateTonight()}
                    >
                      Cette nuit
                    </button>
                    <button
                      type="button"
                      className="chat-connectors-row__connect"
                      disabled={updateBusy}
                      onClick={() => void handleInstallUpdateNow()}
                    >
                      Maintenant
                      <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                    </button>
                  </>
                ) : item.kind === "friend_request" && item.friendRequestId ? (
                  <>
                    <button
                      type="button"
                      className="chat-connectors-row__connect"
                      disabled={friendActionBusy}
                      onClick={() => void handleFriendRequestDecline()}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="chat-connectors-row__connect"
                      disabled={friendActionBusy}
                      onClick={() => void handleFriendRequestAccept()}
                    >
                      Accept
                      <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="chat-connectors-row__connect"
                    onClick={handleNext}
                  >
                    {item.kind === "poll" ? "Voir le sondage" : "Next"}
                    <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          </article>
        )}
      </div>
    </>,
    document.body,
  );
}
