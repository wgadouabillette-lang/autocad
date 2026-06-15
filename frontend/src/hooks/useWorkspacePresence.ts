import { useEffect } from "react";
import { touchWorkspacePresence, watchWorkspacePresence } from "../lib/firebase/workspacePresence";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";
import { useWorkspacePresenceStore } from "../store/useWorkspacePresenceStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

const HEARTBEAT_MS = 30_000;

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

export function useWorkspacePresence() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userDisplayName = useStore((s) => s.userDisplayName);
  const photoURL = useStore((s) => s.photoURL);
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

    const profile = {
      displayName: userDisplayName.trim() || "Membre",
      photoURL: photoURL ?? undefined,
    };

    const heartbeat = () => {
      void Promise.all(
        workspaceIds.map((workspaceId) =>
          touchWorkspacePresence(workspaceId, firebaseUid, profile),
        ),
      );
    };

    heartbeat();
    const heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [firebaseUid, isAuthenticated, userDisplayName, photoURL, workspaceIdsKey]);

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(workspaceIdsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const unsubs = workspaceIds.map((workspaceId) =>
      watchWorkspacePresence(
        workspaceId,
        (members) => {
          useWorkspacePresenceStore.getState().setWorkspacePresence(workspaceId, members);
          const memberRows = members.map((member) => ({
            id: member.uid,
            name: member.displayName,
            photoURL: member.photoURL,
          }));
          useCallsStore.getState().syncPresenceMembers(workspaceId, memberRows, firebaseUid);
        },
        () => {
          useWorkspacePresenceStore.getState().clearWorkspacePresence(workspaceId);
        },
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
      for (const workspaceId of workspaceIds) {
        useWorkspacePresenceStore.getState().clearWorkspacePresence(workspaceId);
      }
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setInterval(() => {
      useWorkspacePresenceStore.getState().tickPresence();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated]);
}
