import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import { useStore, type ChatSession } from "../../store/useStore";

export default function ChatTabsBar() {
  const {
    openChatTabs,
    activeChatTabId,
    switchChatTab,
    goBackChat,
    canGoBackChat,
  } = useStore();

  if (openChatTabs.length === 0) return null;

  const canBack = canGoBackChat();

  return (
    <div className="chat-tabs-bar shrink-0 border-b border-ink-700">
      <button
        type="button"
        className={clsx(
          "chat-tab-back shrink-0",
          canBack ? "chat-tab-back--active" : "chat-tab-back--disabled",
        )}
        disabled={!canBack}
        onClick={() => goBackChat()}
        title={canBack ? "Previous conversation" : "No previous conversation"}
        aria-label="Back to previous conversation"
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
      </button>
      <div
        className="chat-tabs-scroll flex min-w-0 flex-1 gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Active conversations"
      >
        {openChatTabs.map((tab: ChatSession) => {
          const active = tab.id === activeChatTabId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchChatTab(tab.id)}
              title={tab.title}
              className={clsx(
                "chat-tab-btn max-w-[9.5rem] truncate",
                active ? "chat-tab-btn--active" : "chat-tab-btn--idle",
              )}
            >
              {tab.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
