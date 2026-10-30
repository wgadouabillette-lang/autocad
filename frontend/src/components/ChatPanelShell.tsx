import { AGENT_PANEL_TITLE } from "../lib/appBrand";
import clsx from "clsx";
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useSpotifyAudioPulse } from "../hooks/useSpotifyAudioPulse";
import { useHallDjStore } from "../store/useHallDjStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { useTranslation } from "react-i18next";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { isMarketingPreview, landingLabel } from "../lib/marketingPreview";
import { isRecordingSession } from "../lib/chatSessionKinds";
import { isNotesEditorPromoSurface } from "../lib/notesFullscreenPromo";
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
import CalendarFullscreenMonthNav from "./calendar/CalendarFullscreenMonthNav";
import AgentFullscreenSkills from "./chat/AgentFullscreenSkills";
import NotesFullscreenPromo from "./chat/NotesFullscreenPromo";
import RecordingPlaybackView from "./chat/RecordingPlaybackView";

const LEAVE_ANIM_MS = 540;
const CHAT_PANEL_WIDTH_KEY = "meetra.chatPanelWidth";
const CHAT_PANEL_WIDTH_VAR = "--forma-chat-panel-width";
const CHAT_PANEL_WIDTH_MIN_REM = 22;
const CHAT_PANEL_WIDTH_MAX_REM = 34;
const MARKETING_CHAT_PANEL_WIDTH_REM = 32;

function rootRemPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function clampChatPanelWidth(px: number): number {
  const rem = rootRemPx();
  const min = CHAT_PANEL_WIDTH_MIN_REM * rem;
  const max = CHAT_PANEL_WIDTH_MAX_REM * rem;
  return Math.round(Math.min(max, Math.max(min, px)));
}

function applyChatPanelWidth(px: number) {
  document.documentElement.style.setProperty(CHAT_PANEL_WIDTH_VAR, `${px}px`);
}

function ChatPanelResizeHandle({
  side,
  panelRef,
}: {
  side: "left" | "right";
  panelRef: RefObject<HTMLElement | null>;
}) {
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or already released */
    }
    const startX = event.clientX;
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? 26 * rootRemPx();
    document.documentElement.classList.add("is-chat-panel-resizing");

    const widthFor = (clientX: number) => {
      const delta = side === "right" ? startX - clientX : clientX - startX;
      return clampChatPanelWidth(startWidth + delta);
    };

    const onMove = (ev: PointerEvent) => {
      applyChatPanelWidth(widthFor(ev.clientX));
    };
    const onUp = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.documentElement.classList.remove("is-chat-panel-resizing");
      const next = widthFor(ev.clientX);
      applyChatPanelWidth(next);
      try {
        localStorage.setItem(CHAT_PANEL_WIDTH_KEY, String(next));
      } catch {
        /* ignore private mode */
      }
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return (
    <button
      type="button"
      className="chat-panel-resize"
      aria-label={landingLabel("Resize panel", "Redimensionner le panneau")}
      onPointerDown={onPointerDown}
    />
  );
}

export default function ChatPanelShell() {
  const { t } = useTranslation();
  const isMobileLayout = useMobileLayout();
  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const closeChatPanel = useStore((s) => s.closeChatPanel);
  const storedChatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelExpanded = isMarketingPreview() && storedChatPanelExpanded;
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
    if (isMobileLayout) {
      document.documentElement.style.removeProperty(CHAT_PANEL_WIDTH_VAR);
      return;
    }
    if (isMarketingPreview()) {
      applyChatPanelWidth(MARKETING_CHAT_PANEL_WIDTH_REM * rootRemPx());
      return;
    }
    try {
      const saved = Number(localStorage.getItem(CHAT_PANEL_WIDTH_KEY));
      if (Number.isFinite(saved) && saved > 0) applyChatPanelWidth(clampChatPanelWidth(saved));
    } catch {
      /* ignore private mode */
    }
  }, [isMobileLayout]);

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
      ? t("chat.calendarTitle")
      : chatPanelMode === "friends"
        ? t("chat.friends")
        : chatPanelMode === "theater"
          ? t("chat.theaterChat")
          : isVoiceAssistPanelMode(chatPanelMode)
            ? t("chat.voiceAssist")
            : AGENT_PANEL_TITLE;

  const spotifyCurrentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const spotifyPlaying = useSpotifyPlayerStore((s) => s.playing);
  const spotifyPlaybackMode = useSpotifyPlayerStore((s) => s.playbackMode);
  const hallDjLoading = useHallDjStore((s) => s.loading);
  const hallDjActive = useHallDjStore((s) => s.active);
  const spotifyPulseLevel = useSpotifyAudioPulse();
  const spotifyPulseActive =
    (spotifyCurrentTrack != null || hallDjActive || hallDjLoading) &&
    (spotifyPlaying || spotifyPlaybackMode !== null);
  const spotifyPulseStyle = spotifyPulseActive
    ? ({ "--spotify-pulse": String(spotifyPulseLevel * 0.22) } as CSSProperties)
    : undefined;

  const isOverlay = !isMobileLayout && (chatPanelExpanded || leaving);
  const keepOverlayPosition = isOverlay;

  return (
    <>
      {isMobileLayout && (
        <button
          type="button"
          className="chat-panel-mobile-backdrop"
          aria-label={t("chat.closePanel")}
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
          chatPanelMode === "agent" && "chat-panel--mode-agent",
          chatPanelMode === "ai-notes" && "chat-panel--mode-ai-notes",
          chatPanelMode === "friends" && "chat-panel--mode-friends",
          spotifyPulseActive && "chat-panel--spotify-pulse",
        )}
        style={spotifyPulseStyle}
        aria-label={panelLabel}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.animationName.startsWith("chat-panel-leave-shell") && leaving) {
            finishLeave();
          }
        }}
      >
      {!isMobileLayout && !isOverlay ? (
        <ChatPanelResizeHandle side={sidePanelSide} panelRef={panelRef} />
      ) : null}
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
            chatPanelMode === "ai-notes" && showChatHistory ? (
              <ChatHistoryView />
            ) : chatPanelMode === "ai-notes" && showRecordingPlayback ? (
              <RecordingPlaybackView />
            ) : (
              <VoiceAssistPanel />
            )
          ) : showChatHistory ? (
            <ChatHistoryView />
          ) : showRecordingPlayback ? (
            <RecordingPlaybackView />
          ) : (
            <ChatPanel />
          )}
        </div>
      </div>
      {isOverlay && chatPanelMode === "calendar" && <CalendarFullscreenMonthNav />}
      {isOverlay && chatPanelMode === "calendar" && <CalendarFullscreenComposerPip />}
      {isOverlay && chatPanelMode === "agent" && <AgentFullscreenSkills />}
      {isNotesEditorPromoSurface({
        isMobileLayout,
        chatPanelExpanded,
        chatPanelMode,
        showChatHistory,
        showRecordingPlayback,
      }) ? (
        <NotesFullscreenPromo />
      ) : null}
    </aside>
    </>
  );
}
