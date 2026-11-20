import { useEffect, useMemo, useRef } from "react";
import {
  watchJoinRequestForUser,
  watchPendingJoinRequests,
  watchSharedWorkspace,
} from "../lib/firebase/workspaceRegistry";
import { watchIncomingWorkspaceInvites } from "../lib/firebase/userData";
import { useAuthStore } from "../store/useAuthStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { useStore } from "../store/useStore";
import {
  acceptSharedWorkspaceJoin,
  useWorkspacesStore,
} from "../store/useWorkspacesStore";

function inviteCreatedAtMs(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: () => number }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Date.now();
}

export function useWorkspaceJoinRequests() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const memberships = useWorkspacesStore((s) => s.memberships);
  const customServers = useWorkspacesStore((s) => s.customServers);
  const applySharedWorkspaceSettings = useWorkspacesStore((s) => s.applySharedWorkspaceSettings);
  const pendingJoinRequests = useWorkspacesStore((s) => s.pendingJoinRequests);
  const removePendingJoinRequest = useWorkspacesStore((s) => s.removePendingJoinRequest);
  const reconcilePendingJoinRequests = useWorkspacesStore((s) => s.reconcilePendingJoinRequests);
  const pushNotification = useNotificationsStore((s) => s.push);
  const syncWorkspaceInvites = useNotificationsStore((s) => s.syncWorkspaceInvites);
  const syncWorkspaceJoinRequests = useNotificationsStore((s) => s.syncWorkspaceJoinRequests);
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

  const manageableWorkspaceIds = useMemo(() => {
    if (!firebaseUid) return [] as string[];
    const store = useWorkspacesStore.getState();
    return store
      .joinedWorkspaces(firebaseUid)
      .filter((workspace) => store.canManageWorkspaceInvites(workspace.id, firebaseUid))
      .map((workspace) => workspace.id)
      .sort();
  }, [firebaseUid, memberships, customServers]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid) {
      syncWorkspaceJoinRequests([]);
      return;
    }
    if (manageableWorkspaceIds.length === 0) {
      syncWorkspaceJoinRequests([]);
      useWorkspacesStore.setState({ incomingJoinRequests: [] });
      return;
    }

    const byWorkspace = new Map<
      string,
      { name: string; requests: Parameters<typeof syncWorkspaceJoinRequests>[0] }
    >();
    const reported = new Set<string>();

    const publish = () => {
      const activeRequests = byWorkspace.get(activeRoomId)?.requests ?? [];
      useWorkspacesStore.setState({
        incomingJoinRequests: activeRequests.map((request) => ({
          requesterUid: request.requesterUid,
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          status: "pending" as const,
        })),
      });
      if (reported.size < manageableWorkspaceIds.length) return;
      const rows = manageableWorkspaceIds.flatMap(
        (workspaceId) => byWorkspace.get(workspaceId)?.requests ?? [],
      );
      syncWorkspaceJoinRequests(rows);
    };

    const unsubs = manageableWorkspaceIds.map((workspaceId) =>
      watchPendingJoinRequests(
        workspaceId,
        (requests) => {
          const workspaceName =
            useWorkspacesStore.getState().findWorkspace(workspaceId)?.name?.trim() ||
            "votre workspace";
          const rows = requests.map((request) => ({
            id: `workspace-join-${workspaceId}-${request.requesterUid}`,
            workspaceId,
            workspaceName,
            requesterUid: request.requesterUid,
            requesterName: request.requesterName,
            requesterEmail: request.requesterEmail,
          }));
          byWorkspace.set(workspaceId, { name: workspaceName, requests: rows });
          reported.add(workspaceId);
          publish();
        },
        () => {
          byWorkspace.set(workspaceId, {
            name:
              useWorkspacesStore.getState().findWorkspace(workspaceId)?.name?.trim() ||
              "votre workspace",
            requests: [],
          });
          reported.add(workspaceId);
          publish();
        },
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [
    activeRoomId,
    firebaseUid,
    isAuthenticated,
    manageableWorkspaceIds,
    syncWorkspaceJoinRequests,
  ]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid) {
      syncWorkspaceInvites([]);
      return;
    }

    return watchIncomingWorkspaceInvites(
      firebaseUid,
      (invites) => {
        syncWorkspaceInvites(
          invites.map((invite) => ({
            id: `workspace-invite-${invite.workspaceId}`,
            workspaceInviteId: invite.workspaceId,
            title: "Invitation workspace",
            body: `${invite.invitedByName} vous invite à rejoindre ${invite.workspaceName}.`,
            createdAt: inviteCreatedAtMs(invite.createdAt),
          })),
        );
      },
      () => {
        syncWorkspaceInvites([]);
      },
    );
  }, [firebaseUid, isAuthenticated, syncWorkspaceInvites]);

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
