import { useEffect } from "react";
import {
  DEFAULT_WORKSPACE_TEXT_CHANNELS,
  ensureDefaultWorkspaceTextChannels,
  markWorkspaceTextDefaultsSeeded,
  retireUnusedDefaultTextChannel,
  watchWorkspaceTextChannels,
  workspaceTextDefaultsSeeded,
  type WorkspaceTextChannelDoc,
} from "../lib/firebase/workspaceTextChannels";
import { isMarketingPreview } from "../lib/marketingPreview";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { useWorkspaceTextChannelsStore } from "../store/useWorkspaceTextChannelsStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";
import {
  useWorkspaceListenTargetIds,
  workspaceListenTargetsKey,
} from "./useWorkspaceListenTargetIds";

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

function defaultTextChannels(workspaceId: string): WorkspaceTextChannelDoc[] {
  return DEFAULT_WORKSPACE_TEXT_CHANNELS.map((channel) => ({
    id: channel.id,
    workspaceId,
    name: channel.name,
  }));
}

export function useWorkspaceTextChannels() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;
  const listenTargetsKey = workspaceListenTargetsKey(
    useWorkspaceListenTargetIds(ownerUserId),
  );

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(listenTargetsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const unsubs = workspaceIds.map((workspaceId) =>
      watchWorkspaceTextChannels(
        workspaceId,
        (remoteChannels) => {
          if (
            !isMarketingPreview() &&
            useWorkspacesStore.getState().isWorkspaceOwner(workspaceId) &&
            remoteChannels.some((channel) => channel.id === "annonces")
          ) {
            void retireUnusedDefaultTextChannel(workspaceId).catch(() => {});
          }
          if (remoteChannels.length > 0) {
            markWorkspaceTextDefaultsSeeded(workspaceId);
          } else if (!isMarketingPreview() && !workspaceTextDefaultsSeeded(workspaceId)) {
            const defaults = defaultTextChannels(workspaceId);
            useWorkspaceTextChannelsStore.getState().syncRemoteChannels(workspaceId, defaults);
            usePeopleStore.getState().syncWorkspaceTextChannelsMetadata(workspaceId, defaults);
            void ensureDefaultWorkspaceTextChannels(workspaceId, firebaseUid).catch(() => {
              useWorkspaceTextChannelsStore.getState().syncRemoteChannels(workspaceId, []);
              usePeopleStore.getState().syncWorkspaceTextChannelsMetadata(workspaceId, []);
            });
            return;
          }
          useWorkspaceTextChannelsStore.getState().syncRemoteChannels(workspaceId, remoteChannels);
          usePeopleStore.getState().syncWorkspaceTextChannelsMetadata(workspaceId, remoteChannels);
        },
        () => {},
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, listenTargetsKey]);
}
