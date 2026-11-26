import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { ArrowUpRight, Check, Hash, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/useAuthStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useWorkspaceTextChannelsStore, EMPTY_WORKSPACE_TEXT_CHANNELS } from "../../store/useWorkspaceTextChannelsStore";

interface WorkspaceTextChannelsSectionProps {
  workspaceId: string;
  selectedThreadId?: string | null;
  onOpenChannel: (threadId: string) => void;
}

export default function WorkspaceTextChannelsSection({
  workspaceId,
  selectedThreadId,
  onOpenChannel,
}: WorkspaceTextChannelsSectionProps) {
  const { t } = useTranslation();
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const workspaceThreads = usePeopleStore((s) => s.workspaceChannelThreadsForWorkspace(workspaceId));
  const ensureWorkspaceTextChannelThread = usePeopleStore((s) => s.ensureWorkspaceTextChannelThread);
  const channels = useWorkspaceTextChannelsStore(
    (s) => s.channelsByWorkspace[workspaceId] ?? EMPTY_WORKSPACE_TEXT_CHANNELS,
  );
  const startDraft = useWorkspaceTextChannelsStore((s) => s.startDraft);
  const cancelDraft = useWorkspaceTextChannelsStore((s) => s.cancelDraft);
  const confirmDraft = useWorkspaceTextChannelsStore((s) => s.confirmDraft);
  const deleteChannel = useWorkspaceTextChannelsStore((s) => s.deleteChannel);
  const isWorkspaceOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(workspaceId));

  const draftChannel = channels.find((channel) => channel.isDraft);
  const visibleChannels = channels.filter((channel) => !channel.isDraft);
  const [draftName, setDraftName] = useState("");
  const draftInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draftChannel) {
      setDraftName("");
      return;
    }
    setDraftName("");
    draftInputRef.current?.focus();
  }, [draftChannel?.id]);

  const isEmpty = visibleChannels.length === 0;
  const createChatLabel = t("chat.createChat");

  const openChannel = (channelId: string, name: string) => {
    const threadId = ensureWorkspaceTextChannelThread(workspaceId, channelId, name);
    onOpenChannel(threadId);
  };

  const submitDraft = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draftChannel) return;
    const trimmed = draftName.trim();
    if (!trimmed) return;
    confirmDraft(workspaceId, draftChannel.id, trimmed, firebaseUid ?? undefined);
  };

  return (
    <div
      className={clsx(
        "workspace-text-channels",
        isEmpty && "workspace-text-channels--empty",
      )}
    >
      {isEmpty && !draftChannel ? (
        <button
          type="button"
          className="workspace-create-chat-capsule"
          onClick={() => startDraft(workspaceId)}
          aria-label={createChatLabel}
        >
          {createChatLabel}
          <ArrowUpRight size={12} strokeWidth={2.25} aria-hidden />
        </button>
      ) : null}

      {visibleChannels.length > 0 ? (
        <ul className="messages-panel-category__list">
          {visibleChannels.map((channel) => {
          const thread = workspaceThreads.find((entry) => entry.personId === channel.id);
          const selected = !!thread && thread.id === selectedThreadId;

          return (
            <li
              key={channel.id}
              className="messages-panel-category__item messages-overlay__thread-item"
            >
              <div className="messages-overlay__thread-row-wrap">
                <button
                  type="button"
                  className={clsx(
                    "messages-overlay__thread-row messages-thread-card",
                    thread && thread.unread > 0 && "messages-thread-card--unread",
                    selected && "messages-thread-card--active",
                  )}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => openChannel(channel.id, channel.name)}
                >
                  <span className="workspace-text-channel-row__mark" aria-hidden>
                    <Hash size={14} strokeWidth={2} />
                  </span>
                  <span className="messages-thread-card__body">
                    <span className="messages-overlay__thread-name">{channel.name}</span>
                    <span className="messages-overlay__thread-preview">
                      {thread?.preview || "Salon"}
                    </span>
                  </span>
                </button>
                {isWorkspaceOwner ? (
                  <button
                    type="button"
                    className="messages-overlay__thread-delete"
                    onClick={() => deleteChannel(workspaceId, channel.id)}
                    aria-label={`Delete ${channel.name}`}
                    title="Delete channel"
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden />
                  </button>
                ) : null}
              </div>
            </li>
          );
          })}
        </ul>
      ) : null}

      {draftChannel ? (
        <form className="workspace-text-channel-create workspace-text-channel-create--draft" onSubmit={submitDraft}>
          <Hash size={14} className="workspace-text-channel-create__hash" aria-hidden />
          <input
            ref={draftInputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            className="workspace-text-channel-create__input"
            placeholder="Channel name"
            maxLength={120}
            aria-label="New channel name"
          />
          <button
            type="submit"
            className="workspace-text-channel-create__icon-btn"
            disabled={!draftName.trim()}
            aria-label="Create channel"
          >
            <Check size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="workspace-text-channel-create__icon-btn"
            onClick={() => cancelDraft(workspaceId)}
            aria-label="Cancel"
          >
            <X size={14} aria-hidden />
          </button>
        </form>
      ) : !isEmpty ? (
        <button
          type="button"
          className="open-channel-add"
          onClick={() => startDraft(workspaceId)}
          aria-label="Create a text channel"
          title="Create a text channel"
        >
          <span className="open-channel-add__label">
            <Plus size={12} strokeWidth={2.25} aria-hidden />
            Text channel
            <Hash size={12} strokeWidth={2.25} aria-hidden />
          </span>
        </button>
      ) : null}
    </div>
  );
}
