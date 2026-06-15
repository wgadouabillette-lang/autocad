import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { chatPanelModeTabs } from "../../lib/chatPanelModes";
import type { ChatPanelMode } from "../../lib/voiceAssistPanel";
import { useCallsStore } from "../../store/useCallsStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";

export default function ChatPanelModeTabs() {
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const switchChatPanelMode = useStore((s) => s.switchChatPanelMode);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const inTheaterView = useCallsStore(
    (s) => s.getCallsViewMode(activeRoomId) === "theater",
  );
  const unreadPeopleMessages = usePeopleStore((s) => s.peopleMessagesUnreadCount());
  const hasUnreadPeopleMessages = unreadPeopleMessages > 0;
  const tabs = chatPanelModeTabs(subscriptionPlan, inTheaterView);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fadeRight, setFadeRight] = useState(false);

  const updateScrollFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setFadeRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollFade();
    el.addEventListener("scroll", updateScrollFade, { passive: true });
    const observer = new ResizeObserver(updateScrollFade);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollFade);
      observer.disconnect();
    };
  }, [tabs.length, updateScrollFade]);

  const selectTab = (mode: ChatPanelMode) => {
    switchChatPanelMode(mode);
  };

  return (
    <div className="chat-panel-mode-tabs">
      <div className="chat-panel-mode-tabs__fade-wrap">
        {fadeRight && (
          <div className="chat-panel-mode-tabs__fade chat-panel-mode-tabs__fade--right" aria-hidden />
        )}
        <div ref={scrollRef} className="chat-panel-mode-tabs__scroll">
          <nav
            className="chat-panel-mode-tabs__nav"
            role="tablist"
            aria-label="Vues du panneau"
          >
            {tabs.map((tab) => {
              const active = chatPanelMode === tab.id;
              const Icon = tab.icon;
              const showUnreadDot = tab.id === "friends" && hasUnreadPeopleMessages;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={clsx(
                    "chat-panel-mode-tabs__btn",
                    active && "is-active",
                    showUnreadDot && "chat-panel-mode-tabs__btn--with-dot",
                  )}
                  onClick={() => selectTab(tab.id)}
                  aria-selected={active}
                  aria-pressed={active}
                  aria-label={
                    tab.id === "friends" && hasUnreadPeopleMessages
                      ? `Messages, ${unreadPeopleMessages} non lu${unreadPeopleMessages > 1 ? "s" : ""}`
                      : tab.label
                  }
                >
                  <span className="chat-panel-mode-tabs__icon-wrap">
                    <Icon size={11} aria-hidden />
                  </span>
                  <span>{tab.label}</span>
                  {showUnreadDot && <span className="forma-unread-dot" aria-hidden />}
                </button>
              );
            })}
            <span className="chat-panel-mode-tabs__tail" aria-hidden />
          </nav>
        </div>
      </div>
    </div>
  );
}
