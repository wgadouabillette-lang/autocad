import { useEffect } from "react";
import { watchOpenVoiceChannels } from "../lib/firebase/workspaceOpenVoiceChannels";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

export function useWorkspaceOpenVoiceChannels() {
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
      watchOpenVoiceChannels(
        workspaceId,
        (remoteChannels) => {
          useCallsStore.getState().syncRemoteOpenVoiceChannels(workspaceId, remoteChannels);
        },
        () => {},
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);
}
