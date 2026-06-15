import { useEffect } from "react";
import { watchWorkspacePoll } from "../lib/firebase/workspacePolls";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { useVoicePollStore } from "../store/useVoicePollStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

export function useWorkspacePolls() {
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
      watchWorkspacePoll(
        workspaceId,
        (poll) => {
          if (!poll) {
            useVoicePollStore.getState().expirePoll(workspaceId);
            return;
          }
          const previous = useVoicePollStore.getState().getActivePoll(workspaceId);
          useVoicePollStore.getState().ingestPoll(poll);
          if (!previous && poll.status === "open") {
            useVoicePollStore.getState().openVotePanel(workspaceId);
          }
        },
        () => {},
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);
}
