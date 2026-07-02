import { create } from "zustand";
import type { WorkspaceTextChannelDoc } from "../lib/firebase/workspaceTextChannels";
import { upsertWorkspaceTextChannel, removeWorkspaceTextChannel } from "../lib/firebase/workspaceTextChannels";
import { usePeopleStore } from "./usePeopleStore";
import { useWorkspacesStore } from "./useWorkspacesStore";

export interface WorkspaceTextChannelEntry {
  id: string;
  workspaceId: string;
  name: string;
  isDraft?: boolean;
}

interface WorkspaceTextChannelsState {
  channelsByWorkspace: Record<string, WorkspaceTextChannelEntry[]>;
  renamingChannel: { workspaceId: string; channelId: string } | null;
  syncRemoteChannels: (workspaceId: string, remote: WorkspaceTextChannelDoc[]) => void;
  startDraft: (workspaceId: string) => string | null;
  cancelDraft: (workspaceId: string) => void;
  confirmDraft: (workspaceId: string, channelId: string, name: string, createdByUid?: string) => void;
  beginRename: (workspaceId: string, channelId: string) => void;
  cancelRename: () => void;
  confirmRename: (workspaceId: string, channelId: string, name: string) => void;
  deleteChannel: (workspaceId: string, channelId: string) => void;
  clearWorkspace: (workspaceId: string) => void;
}

function sortChannels(channels: WorkspaceTextChannelEntry[]): WorkspaceTextChannelEntry[] {
  return [...channels].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function createDraftChannel(workspaceId: string): WorkspaceTextChannelEntry {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    name: "",
    isDraft: true,
  };
}

export const EMPTY_WORKSPACE_TEXT_CHANNELS: WorkspaceTextChannelEntry[] = [];

function channelsEqual(
  left: WorkspaceTextChannelEntry[],
  right: WorkspaceTextChannelEntry[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (channel, index) =>
      channel.id === right[index]?.id &&
      channel.workspaceId === right[index]?.workspaceId &&
      channel.name === right[index]?.name &&
      Boolean(channel.isDraft) === Boolean(right[index]?.isDraft),
  );
}

export const useWorkspaceTextChannelsStore = create<WorkspaceTextChannelsState>((set, get) => ({
  channelsByWorkspace: {},
  renamingChannel: null,

  syncRemoteChannels: (workspaceId, remote) => {
    set((state) => {
      const current = state.channelsByWorkspace[workspaceId] ?? EMPTY_WORKSPACE_TEXT_CHANNELS;
      const draft = current.find((channel) => channel.isDraft);
      const remoteEntries: WorkspaceTextChannelEntry[] = remote.map((channel) => ({
        id: channel.id,
        workspaceId: channel.workspaceId,
        name: channel.name?.trim() || "general",
      }));
      const merged = sortChannels(draft ? [...remoteEntries, draft] : remoteEntries);
      if (channelsEqual(current, merged)) return state;
      return {
        channelsByWorkspace: {
          ...state.channelsByWorkspace,
          [workspaceId]: merged,
        },
      };
    });
  },

  startDraft: (workspaceId) => {
    if (!workspaceId) return null;
    const current = get().channelsByWorkspace[workspaceId] ?? [];
    if (current.some((channel) => channel.isDraft)) {
      return current.find((channel) => channel.isDraft)?.id ?? null;
    }
    const draft = createDraftChannel(workspaceId);
    set((state) => ({
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: sortChannels([...current, draft]),
      },
    }));
    return draft.id;
  },

  cancelDraft: (workspaceId) => {
    set((state) => ({
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: (state.channelsByWorkspace[workspaceId] ?? []).filter(
          (channel) => !channel.isDraft,
        ),
      },
    }));
  },

  confirmDraft: (workspaceId, channelId, name, createdByUid) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    set((state) => ({
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: sortChannels(
          (state.channelsByWorkspace[workspaceId] ?? [])
            .filter((channel) => !channel.isDraft)
            .concat({
              id: channelId,
              workspaceId,
              name: trimmedName,
            }),
        ),
      },
    }));
    void upsertWorkspaceTextChannel(workspaceId, channelId, trimmedName, createdByUid);
  },

  beginRename: (workspaceId, channelId) => {
    set({ renamingChannel: { workspaceId, channelId } });
  },

  cancelRename: () => {
    set({ renamingChannel: null });
  },

  confirmRename: (workspaceId, channelId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      set({ renamingChannel: null });
      return;
    }
    set((state) => ({
      renamingChannel: null,
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: sortChannels(
          (state.channelsByWorkspace[workspaceId] ?? []).map((channel) =>
            channel.id === channelId ? { ...channel, name: trimmedName } : channel,
          ),
        ),
      },
    }));
    void upsertWorkspaceTextChannel(workspaceId, channelId, trimmedName);
  },

  deleteChannel: (workspaceId, channelId) => {
    if (!useWorkspacesStore.getState().isWorkspaceOwner(workspaceId)) return;

    set((state) => ({
      renamingChannel:
        state.renamingChannel?.workspaceId === workspaceId &&
        state.renamingChannel.channelId === channelId
          ? null
          : state.renamingChannel,
      channelsByWorkspace: {
        ...state.channelsByWorkspace,
        [workspaceId]: (state.channelsByWorkspace[workspaceId] ?? EMPTY_WORKSPACE_TEXT_CHANNELS).filter(
          (channel) => channel.id !== channelId,
        ),
      },
    }));

    void removeWorkspaceTextChannel(workspaceId, channelId).catch(() => {});
    usePeopleStore.getState().removeWorkspaceTextChannelThread(workspaceId, channelId);
  },

  clearWorkspace: (workspaceId) => {
    set((state) => {
      const channelsByWorkspace = { ...state.channelsByWorkspace };
      delete channelsByWorkspace[workspaceId];
      const renamingChannel =
        state.renamingChannel?.workspaceId === workspaceId ? null : state.renamingChannel;
      return { channelsByWorkspace, renamingChannel };
    });
  },
}));
