import { useEffect } from "react";
import { watchJoinRequestForUser, watchPendingJoinRequests } from "../lib/firebase/workspaceRegistry";
import { useAuthStore } from "../store/useAuthStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { useStore } from "../store/useStore";
import {
  acceptSharedWorkspaceJoin,
  useWorkspacesStore,
} from "../store/useWorkspacesStore";

export function useWorkspaceJoinRequests() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const isOwner = useWorkspacesStore((s) => s.isWorkspaceOwner(activeRoomId));
  const pendingJoinRequests = useWorkspacesStore((s) => s.pendingJoinRequests);
  const removePendingJoinRequest = useWorkspacesStore((s) => s.removePendingJoinRequest);
  const pushNotification = useNotificationsStore((s) => s.push);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid || !activeRoomId || !isOwner) return;

    let previousCount = 0;
    return watchPendingJoinRequests(
      activeRoomId,
      (requests) => {
        if (requests.length > previousCount && previousCount > 0) {
          const latest = requests[requests.length - 1];
          pushNotification({
            kind: "workspace",
            title: "Demande d'adhésion",
            body: `${latest.requesterName} souhaite rejoindre votre workspace.`,
          });
        }
        previousCount = requests.length;
        useWorkspacesStore.setState({ incomingJoinRequests: requests });
      },
      () => {
        useWorkspacesStore.setState({ incomingJoinRequests: [] });
      },
    );
  }, [activeRoomId, firebaseUid, isAuthenticated, isOwner, pushNotification]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid || pendingJoinRequests.length === 0) return;

    const unsubs = pendingJoinRequests.map((workspaceId) =>
      watchJoinRequestForUser(workspaceId, firebaseUid, async (request) => {
        if (!request) return;
        if (request.status === "accepted") {
          const added = await acceptSharedWorkspaceJoin(workspaceId, firebaseUid);
          removePendingJoinRequest(workspaceId);
          if (added) {
            await useAuthStore.getState().syncWorkspacesToCloud();
            useStore.getState().switchWorkspace(workspaceId);
            pushNotification({
              kind: "workspace",
              title: "Workspace rejoint",
              body: "Votre demande d'adhésion a été acceptée.",
            });
          }
        } else if (request.status === "declined") {
          removePendingJoinRequest(workspaceId);
          pushNotification({
            kind: "workspace",
            title: "Demande refusée",
            body: "Le propriétaire a refusé votre demande d'adhésion.",
          });
        }
      }),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [
    firebaseUid,
    isAuthenticated,
    pendingJoinRequests,
    pushNotification,
    removePendingJoinRequest,
  ]);
}
