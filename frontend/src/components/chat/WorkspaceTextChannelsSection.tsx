import { useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { Check, Hash, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
import { useWorkspaceTextChannelsStore, EMPTY_WORKSPACE_TEXT_CHANNELS } from "../../store/useWorkspaceTextChannelsStore";

interface WorkspaceTextChannelsSectionProps {
  workspaceId: string;
  onOpenChannel: (threadId: string) => void;
}

export default function WorkspaceTextChannelsSection({
  workspaceId,
  onOpenChannel,
}: WorkspaceTextChannelsSectionProps) {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const workspaceThreads = usePeopleStore((s) => s.workspaceChannelThreadsForWorkspace(workspaceId));
  const ensureWorkspaceTextChannelThread = usePeopleStore((s) => s.ensureWorkspaceTextChannelThread);
  const channels = useWorkspaceTextChannelsStore(
    (s) => s.channelsByWorkspace[workspaceId] ?? EMPTY_WORKSPACE_TEXT_CHANNELS,
  );
  const renamingChannel = useWorkspaceTextChannelsStore((s) => s.renamingChannel);
  const startDraft = useWorkspaceTextChannelsStore((s) => s.startDraft);
  const cancelDraft = useWorkspaceTextChannelsStore((s) => s.cancelDraft);
  const confirmDraft = useWorkspaceTextChannelsStore((s) => s.confirmDraft);
  const beginRename = useWorkspaceTextChannelsStore((s) => s.beginRename);
  const cancelRename = useWorkspaceTextChannelsStore((s) => s.cancelRename);
  const confirmRename = useWorkspaceTextChannelsStore((s) => s.confirmRename);
  const deleteChannel = useWorkspaceTextChannelsStore((s) => s.deleteChannel);
  const isWorkspaceOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(workspaceId));

  const draftChannel = channels.find((channel) => channel.isDraft);
  const visibleChannels = channels.filter((channel) => !channel.isDraft);
  const [draftName, setDraftName] = useState("");
  const [renameName, setRenameName] = useState("");
  const draftInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draftChannel) {
      setDraftName("");
      return;
    }
    setDraftName("");
    draftInputRef.current?.focus();
  }, [draftChannel?.id]);

  useEffect(() => {
    if (!renamingChannel || renamingChannel.workspaceId !== workspaceId) {
      setRenameName("");
      return;
    }
    const channel = useWorkspaceTextChannelsStore
      .getState()
      .channelsByWorkspace[workspaceId]?.find((entry) => entry.id === renamingChannel.channelId);
    setRenameName(channel?.name ?? "");
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingChannel, workspaceId]);

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

  const submitRename = (event?: FormEvent) => {
    event?.preventDefault();
    if (!renamingChannel || renamingChannel.workspaceId !== workspaceId) return;
    confirmRename(workspaceId, renamingChannel.channelId, renameName);
  };

  return (
    <div className="workspace-text-channels">
      <ul className="messages-panel-category__list">
        {visibleChannels.map((channel) => {
          const thread = workspaceThreads.find((entry) => entry.personId === channel.id);
          const isRenaming =
            renamingChannel?.workspaceId === workspaceId &&
            renamingChannel.channelId === channel.id;

          return (
            <li
              key={channel.id}
              className="messages-panel-category__item workspace-text-channel-row"
            >
              {isRenaming ? (
                <form className="workspace-text-channel-row__rename-form" onSubmit={submitRename}>
                  <Hash size={14} className="workspace-text-channel-row__hash" aria-hidden />
                  <input
                    ref={renameInputRef}
                    value={renameName}
                    onChange={(event) => setRenameName(event.target.value)}
                    className="workspace-text-channel-row__input"
                    placeholder="Channel name"
                    maxLength={120}
                    aria-label="Rename channel"
                  />
                  <button
                    type="submit"
                    className="workspace-text-channel-row__icon-btn"
                    disabled={!renameName.trim()}
                    aria-label="Save channel name"
                  >
                    <Check size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="workspace-text-channel-row__icon-btn"
                    onClick={cancelRename}
                    aria-label="Cancel rename"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </form>
              ) : (
                <div className="workspace-text-channel-row__content">
                  <button
                    type="button"
                    className={clsx(
                      "workspace-text-channel-row__open",
                      thread && thread.unread > 0 && "workspace-text-channel-row__open--unread",
                    )}
                    onClick={() => openChannel(channel.id, channel.name)}
                  >
                    <Hash size={14} className="workspace-text-channel-row__hash" aria-hidden />
                    <span className="workspace-text-channel-row__name">{channel.name}</span>
                    {thread?.preview ? (
                      <span className="workspace-text-channel-row__preview">{thread.preview}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="workspace-text-channel-row__rename-btn"
                    onClick={() => beginRename(workspaceId, channel.id)}
                    aria-label={`Rename ${channel.name}`}
                    title="Rename channel"
                  >
                    <Pencil size={12} aria-hidden />
                  </button>
                  {isWorkspaceOwner ? (
                    <button
                      type="button"
                      className="workspace-text-channel-row__delete-btn"
                      onClick={() => deleteChannel(workspaceId, channel.id)}
                      aria-label={`Delete ${channel.name}`}
                      title="Delete channel"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

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
      ) : (
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
      )}
    </div>
  );
}
