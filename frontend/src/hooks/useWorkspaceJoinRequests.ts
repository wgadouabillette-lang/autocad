import { useEffect, useRef } from "react";
import {
  watchJoinRequestForUser,
  watchPendingJoinRequests,
  watchSharedWorkspace,
} from "../lib/firebase/workspaceRegistry";
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
  const canManageInvites = useWorkspacesStore((s) => s.canManageWorkspaceInvites(activeRoomId));
  const applySharedWorkspaceSettings = useWorkspacesStore((s) => s.applySharedWorkspaceSettings);
  const pendingJoinRequests = useWorkspacesStore((s) => s.pendingJoinRequests);
  const removePendingJoinRequest = useWorkspacesStore((s) => s.removePendingJoinRequest);
  const reconcilePendingJoinRequests = useWorkspacesStore((s) => s.reconcilePendingJoinRequests);
  const pushNotification = useNotificationsStore((s) => s.push);
  const handledAcceptanceRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid) return;
    void reconcilePendingJoinRequests(firebaseUid);
  }, [firebaseUid, isAuthenticated, reconcilePendingJoinRequests]);

  useEffect(() => {
    if (!isAuthenticated || !activeRoomId) return;
    return watchSharedWorkspace(
      activeRoomId,
      (shared) => {
        if (!shared) return;
        applySharedWorkspaceSettings(activeRoomId, {
          name: shared.name,
          iconURL: shared.iconURL,
          membersCanInvite: shared.membersCanInvite,
        });
      },
      () => {},
    );
  }, [activeRoomId, applySharedWorkspaceSettings, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid || !activeRoomId || !canManageInvites) return;

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
  }, [activeRoomId, firebaseUid, isAuthenticated, canManageInvites, pushNotification]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid || pendingJoinRequests.length === 0) return;

    const unsubs = pendingJoinRequests.map((workspaceId) =>
      watchJoinRequestForUser(workspaceId, firebaseUid, async (request) => {
        if (!request) return;
        const key = `${workspaceId}:${request.status}`;
        if (request.status === "accepted") {
          if (handledAcceptanceRef.current.has(key)) return;
          handledAcceptanceRef.current.add(key);
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
            body: "Votre demande d'adhésion a été refusée.",
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
