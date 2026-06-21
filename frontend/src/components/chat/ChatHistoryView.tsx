import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatShortChatDate, mergeChatHistorySessions } from "../../lib/chatHistory";
import {
  CHAT_SESSION_KIND_META,
  groupChatSessionsByKind,
  type ChatSessionKind,
} from "../../lib/chatSessionKinds";
import { updateActiveTabInTabs, useStore } from "../../store/useStore";
import DeletePeopleChatOverlay from "./DeletePeopleChatOverlay";

const VISIBLE_KINDS: ChatSessionKind[] = ["note", "recording"];

export default function ChatHistoryView() {
  const openChatTabs = useStore((s) => s.openChatTabs);
  const chatSessions = useStore((s) => s.chatSessions);
  const activeChatTabId = useStore((s) => s.activeChatTabId);
  const activeManualNoteId = useStore((s) => s.activeManualNoteId);
  const chat = useStore((s) => s.chat);
  const openChatFromHistory = useStore((s) => s.openChatFromHistory);
  const deleteHistorySession = useStore((s) => s.deleteHistorySession);
  const highlightRecordingId = useStore((s) => s.chatHistoryHighlightRecordingId);
  const clearChatHistoryHighlightRecording = useStore((s) => s.clearChatHistoryHighlightRecording);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!highlightRecordingId) return;
    const id = window.setTimeout(() => clearChatHistoryHighlightRecording(), 1600);
    return () => window.clearTimeout(id);
  }, [highlightRecordingId, clearChatHistoryHighlightRecording]);

  const grouped = useMemo(() => {
    const tabs = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const sessions = mergeChatHistorySessions(tabs, chatSessions);
    return groupChatSessionsByKind(sessions);
  }, [openChatTabs, chatSessions, activeChatTabId, chat]);

  const deleteTarget = useMemo(() => {
    if (!deleteTargetId) return null;
    for (const kind of VISIBLE_KINDS) {
      const found = grouped[kind].find((session) => session.id === deleteTargetId);
      if (found) return found;
    }
    return null;
  }, [deleteTargetId, grouped]);

  const hasAny = VISIBLE_KINDS.some((kind) => grouped[kind].length > 0);

  const confirmDelete = async () => {
    if (!deleteTargetId || deleteBusy) return;
    setDeleteBusy(true);
    await deleteHistorySession(deleteTargetId);
    setDeleteBusy(false);
    setDeleteTargetId(null);
  };

  return (
    <div className="chat-history-view flex h-full min-h-0 flex-col">
      <div className="chat-history-view__list min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-3">
        {!hasAny ? (
          <p className="px-2 py-6 text-center text-xs text-muted-500">
            Nothing yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {VISIBLE_KINDS.map((kind) => {
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
                        const isActive =
                          session.id === activeChatTabId || session.id === activeManualNoteId;
                        const shimmerOnce =
                          kind === "recording" &&
                          !!highlightRecordingId &&
                          session.id === highlightRecordingId;
                        return (
                          <li key={session.id} className="messages-overlay__thread-item">
                            <div className="messages-overlay__thread-row-wrap">
                              <button
                                type="button"
                                onClick={() => openChatFromHistory(session.id)}
                                className={clsx(
                                  "chat-history-row messages-overlay__thread-row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
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
                                <span
                                  className={clsx(
                                    "min-w-0 flex-1 truncate text-[12.5px] font-medium",
                                    shimmerOnce && "text-shimmer-once",
                                  )}
                                >
                                  {session.title}
                                </span>
                                <time
                                  className="messages-overlay__thread-meta shrink-0 text-[11px] tabular-nums text-muted-500"
                                  dateTime={new Date(session.updatedAt).toISOString()}
                                >
                                  {formatShortChatDate(session.updatedAt)}
                                </time>
                              </button>
                              <button
                                type="button"
                                className="messages-overlay__thread-delete"
                                onClick={() => setDeleteTargetId(session.id)}
                                aria-label={`Supprimer ${session.title}`}
                                title={
                                  kind === "recording"
                                    ? "Supprimer l'enregistrement"
                                    : "Supprimer la note"
                                }
                              >
                                <Trash2 size={14} strokeWidth={2} aria-hidden />
                              </button>
                            </div>
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

      {deleteTarget ? (
        <DeletePeopleChatOverlay
          title={`Supprimer ${deleteTarget.title} ?`}
          hint={
            deleteTarget.kind === "recording"
              ? "Cet enregistrement sera supprimé définitivement de votre compte."
              : "Cette note sera supprimée définitivement de votre compte."
          }
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (deleteBusy) return;
            setDeleteTargetId(null);
          }}
        />
      ) : null}
    </div>
  );
}
