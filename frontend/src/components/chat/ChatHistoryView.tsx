import clsx from "clsx";
import { useMemo } from "react";
import { formatShortChatDate, mergeChatHistorySessions } from "../../lib/chatHistory";
import {
  CHAT_SESSION_KIND_META,
  CHAT_SESSION_KIND_ORDER,
  groupChatSessionsByKind,
} from "../../lib/chatSessionKinds";
import { updateActiveTabInTabs, useStore } from "../../store/useStore";

export default function ChatHistoryView() {
  const openChatTabs = useStore((s) => s.openChatTabs);
  const chatSessions = useStore((s) => s.chatSessions);
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const chat = useStore((s) => s.chat);
  const openChatFromHistory = useStore((s) => s.openChatFromHistory);

  const grouped = useMemo(() => {
    const tabs = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const sessions = mergeChatHistorySessions(tabs, chatSessions);
    return groupChatSessionsByKind(sessions);
  }, [openChatTabs, chatSessions, activeChatTabId, chat]);

  const hasAny = CHAT_SESSION_KIND_ORDER.some((kind) => grouped[kind].length > 0);

  return (
    <div className="chat-history-view flex h-full min-h-0 flex-col">
      <div className="chat-history-view__list min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
        {!hasAny ? (
          <p className="px-2 py-6 text-center text-xs text-muted-500">
            Aucune discussion pour l&apos;instant.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {CHAT_SESSION_KIND_ORDER.map((kind) => {
              const { label, emptyLabel, Icon } = CHAT_SESSION_KIND_META[kind];
              const sessions = grouped[kind];

              return (
                <section key={kind} className="chat-history-section">
                  <h3 className="chat-history-section__title px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-500">
                    <Icon size={12} strokeWidth={2} className="shrink-0" aria-hidden />
                    {label}
                  </h3>

                  {sessions.length === 0 ? (
                    <p className="px-2 py-1 text-[11px] text-muted-600">{emptyLabel}</p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {sessions.map((session) => {
                        const isActive = session.id === activeChatTabId;
                        return (
                          <li key={session.id}>
                            <button
                              type="button"
                              onClick={() => openChatFromHistory(session.id)}
                              className={clsx(
                                "chat-history-row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                                isActive
                                  ? "is-active text-muted-100"
                                  : "text-muted-300 hover:text-muted-100",
                              )}
                            >
                              <span
                                className={clsx(
                                  "chat-history-row__dot shrink-0",
                                  isActive && "chat-history-row__dot--active",
                                )}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                                {session.title}
                              </span>
                              <time
                                className="shrink-0 text-[11px] tabular-nums text-muted-500"
                                dateTime={new Date(session.updatedAt).toISOString()}
                              >
                                {formatShortChatDate(session.updatedAt)}
                              </time>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
