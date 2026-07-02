import { useEffect } from "react";
import { watchWorkspaceTextChannels } from "../lib/firebase/workspaceTextChannels";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { useWorkspaceTextChannelsStore } from "../store/useWorkspaceTextChannelsStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

export function useWorkspaceTextChannels() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const ownerUserId = firebaseUid ?? LOCAL_USER_ID;
  const workspaceIdsKey = useWorkspacesStore((s) =>
    s
      .joinedWorkspaces(ownerUserId)
      .map((workspace) => workspace.id)
      .sort()
      .join("\n"),
  );

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(workspaceIdsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const unsubs = workspaceIds.map((workspaceId) =>
      watchWorkspaceTextChannels(
        workspaceId,
        (remoteChannels) => {
          useWorkspaceTextChannelsStore.getState().syncRemoteChannels(workspaceId, remoteChannels);
          usePeopleStore.getState().syncWorkspaceTextChannelsMetadata(workspaceId, remoteChannels);
        },
        () => {},
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);
}
