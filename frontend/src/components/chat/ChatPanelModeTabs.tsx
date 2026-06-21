import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const inTheaterView = useCallsStore(
    (s) => s.getCallsViewMode(activeRoomId) === "theater",
  );
  const friendThreads = usePeopleStore((s) => s.friendThreads);
  const colleagueThreadsByWorkspace = usePeopleStore(
    (s) => s.colleagueThreadsByWorkspace,
  );
  const friendsTabSeenAt = usePeopleStore((s) => s.friendsTabSeenAt);
  const unreadPeopleChats = useMemo(() => {
    const personIds = new Set<string>();
    const track = (thread: { unread: number; updatedAt: number; personId: string }) => {
      if (thread.unread <= 0) return;
      if (thread.updatedAt <= friendsTabSeenAt) return;
      personIds.add(thread.personId);
    };
    for (const thread of friendThreads) track(thread);
    for (const threads of Object.values(colleagueThreadsByWorkspace)) {
      for (const thread of threads) track(thread);
    }
    return personIds.size;
  }, [friendThreads, colleagueThreadsByWorkspace, friendsTabSeenAt]);
  const hasUnreadPeopleMessages = unreadPeopleChats > 0;
  const tabs = chatPanelModeTabs(
    subscriptionPlan,
    inTheaterView,
    billingManaged,
    workspaceEnterpriseActive,
  );
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
            aria-label="Panel views"
          >
            {tabs.map((tab) => {
              const active = chatPanelMode === tab.id;
              const Icon = tab.icon;
              const showUnreadBadge = tab.id === "friends" && hasUnreadPeopleMessages;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={clsx("chat-panel-mode-tabs__btn", active && "is-active")}
                  onClick={() => selectTab(tab.id)}
                  aria-selected={active}
                  aria-pressed={active}
                  aria-label={
                    showUnreadBadge
                      ? `Messages, ${unreadPeopleChats} unread chat${unreadPeopleChats > 1 ? "s" : ""}`
                      : tab.label
                  }
                >
                  <span className="chat-panel-mode-tabs__icon-wrap">
                    <Icon size={11} aria-hidden />
                  </span>
                  <span>{tab.label}</span>
                  {showUnreadBadge && (
                    <span className="chat-panel-mode-tabs__unread-badge" aria-hidden>
                      {unreadPeopleChats}
                    </span>
                  )}
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
