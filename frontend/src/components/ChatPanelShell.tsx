import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { isRecordingSession } from "../lib/chatSessionKinds";
import { useStore } from "../store/useStore";
import DaySchedulePanel from "./calendar/DaySchedulePanel";
import ChatHistoryView from "./chat/ChatHistoryView";
import ChatPanel from "./ChatPanel";
import FriendsChatPanel from "./chat/FriendsChatPanel";
import TheaterChatPanel from "./chat/TheaterChatPanel";
import ChatPanelHeader from "./chat/ChatPanelHeader";
import ChatPanelModeTabs from "./chat/ChatPanelModeTabs";
import VoiceAssistPanel from "./chat/VoiceAssistPanel";
import { isVoiceAssistPanelMode } from "../lib/voiceAssistPanel";
import ChatFullscreenMediaPip from "./chat/ChatFullscreenMediaPip";
import CalendarFullscreenComposerPip from "./calendar/CalendarFullscreenComposerPip";
import RecordingPlaybackView from "./chat/RecordingPlaybackView";

const LEAVE_ANIM_MS = 540;

export default function ChatPanelShell() {
  const isMobileLayout = useMobileLayout();
  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const closeChatPanel = useStore((s) => s.closeChatPanel);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const showChatHistory = useStore((s) => s.showChatHistory);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const openChatTabs = useStore((s) => s.openChatTabs);
  const chatSessions = useStore((s) => s.chatSessions);

  const [entering, setEntering] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const prevExpanded = useRef(chatPanelExpanded);
  const panelRef = useRef<HTMLElement>(null);
  const leaveTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (chatPanelExpanded && !prevExpanded.current) {
      setLeaving(false);
      useStore.setState({ chatPanelLeaveAnimating: false });
      setEntering(true);
    } else if (!chatPanelExpanded && prevExpanded.current) {
      setEntering(false);
      setLeaving(true);
      useStore.setState({ chatPanelLeaveAnimating: true });
    }
    prevExpanded.current = chatPanelExpanded;
  }, [chatPanelExpanded]);

  useLayoutEffect(() => {
    if (!leaving) return;

    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      finishLeave();
      leaveTimer.current = null;
    }, LEAVE_ANIM_MS + 40);

    return () => {
      if (leaveTimer.current !== null) {
        window.clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
    };
  }, [leaving]);

  const finishLeave = () => {
    const panel = panelRef.current;
    const before = panel?.getBoundingClientRect();

    setLeaving(false);
    useStore.setState({ chatPanelLeaveAnimating: false });

    requestAnimationFrame(() => {
      if (!panel || !before) return;

      const after = panel.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;

      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const origin = sidePanelSide === "left" ? "top left" : "top right";
        panel.style.transformOrigin = origin;
        panel.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        panel.getBoundingClientRect();
        panel.style.transition = "transform 0.12s cubic-bezier(0.32, 0.72, 0, 1)";
        panel.style.transform = "";

        const onTransitionEnd = () => {
          panel.style.transition = "";
          panel.style.transform = "";
          panel.style.transformOrigin = "";
          panel.removeEventListener("transitionend", onTransitionEnd);
        };
        panel.addEventListener("transitionend", onTransitionEnd);
      }
    });
  };

  const activeSession =
    openChatTabs.find((tab) => tab.id === activeChatTabId) ??
    chatSessions.find((session) => session.id === activeChatTabId);
  const showRecordingPlayback = isRecordingSession(activeSession);

  if (!chatPanelOpen) return null;

  const panelLabel =
    chatPanelMode === "calendar"
      ? "Calendrier"
      : chatPanelMode === "friends"
        ? "Amis"
        : chatPanelMode === "theater"
          ? "Chat théâtre"
          : isVoiceAssistPanelMode(chatPanelMode)
            ? "Assistance vocale"
            : "XYZ Superagent";

  const isOverlay = !isMobileLayout && (chatPanelExpanded || leaving);
  const keepOverlayPosition = isOverlay;

  return (
    <>
      {isMobileLayout && (
        <button
          type="button"
          className="chat-panel-mobile-backdrop"
          aria-label="Fermer le panneau"
          onClick={closeChatPanel}
        />
      )}
      <aside
        ref={panelRef}
        className={clsx(
          "chat-panel",
          sidePanelSide === "left" ? "chat-panel--dock-left" : "chat-panel--dock-right",
          isMobileLayout && "chat-panel--mobile-drawer",
          keepOverlayPosition && "chat-panel--expanded",
          entering && "chat-panel--expanded-enter",
          leaving && "chat-panel--expanded-leave",
        )}
        aria-label={panelLabel}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.animationName.startsWith("chat-panel-leave-shell") && leaving) {
            finishLeave();
          }
        }}
      >
      <ChatPanelHeader />
      <div
        className="chat-panel__morph"
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (entering) setEntering(false);
        }}
      >
        <ChatPanelModeTabs />
        {isOverlay && <ChatFullscreenMediaPip />}
        <div className="chat-panel__content">
          {chatPanelMode === "calendar" ? (
            <DaySchedulePanel />
          ) : chatPanelMode === "friends" ? (
            <FriendsChatPanel />
          ) : chatPanelMode === "theater" ? (
            <TheaterChatPanel />
          ) : isVoiceAssistPanelMode(chatPanelMode) ? (
            <VoiceAssistPanel />
          ) : showChatHistory ? (
            <ChatHistoryView />
          ) : showRecordingPlayback ? (
            <RecordingPlaybackView />
          ) : (
            <ChatPanel />
          )}
        </div>
      </div>
      {isOverlay && chatPanelMode === "calendar" && <CalendarFullscreenComposerPip />}
    </aside>
    </>
  );
}
