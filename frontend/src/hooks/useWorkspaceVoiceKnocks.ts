import { useEffect } from "react";
import { memberBlockId, type JoinRequest } from "../lib/calls";
import {
  dismissVoiceKnock,
  watchVoiceEjects,
  watchVoiceKnockResponses,
  watchVoiceKnocks,
  type VoiceKnockDoc,
} from "../lib/firebase/workspaceVoiceKnocks";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

function knockToJoinRequest(
  workspaceId: string,
  knock: VoiceKnockDoc,
  localUid: string,
): JoinRequest {
  const isOutgoing = knock.fromUid === localUid;
  return {
    id: knock.id,
    roomId: workspaceId,
    fromBlockId: isOutgoing
      ? memberBlockId(workspaceId, "local")
      : memberBlockId(workspaceId, knock.fromUid),
    toBlockId: isOutgoing
      ? memberBlockId(workspaceId, knock.toUid)
      : memberBlockId(workspaceId, "local"),
    status: "pending",
    personName: isOutgoing ? undefined : knock.fromName,
  };
}

export function useWorkspaceVoiceKnocks() {
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
      watchVoiceKnocks(
        workspaceId,
        firebaseUid,
        (knocks) => {
          const pending = knocks
            .filter((knock) => knock.status === "pending")
            .map((knock) => knockToJoinRequest(workspaceId, knock, firebaseUid));
          useCallsStore.getState().syncRemoteJoinRequests(workspaceId, pending);
        },
        () => {
          // Ne pas effacer les knocks optimistes locaux en cas d'erreur réseau.
        },
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(workspaceIdsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const unsubs = workspaceIds.map((workspaceId) => {
      const consumed = new Set<string>();
      let primed = false;
      const startedAt = Date.now();
      return watchVoiceKnockResponses(
        workspaceId,
        firebaseUid,
        (knocks) => {
          const initial = !primed;
          primed = true;
          const present = new Set(knocks.map((knock) => knock.id));
          for (const id of consumed) {
            if (!present.has(id)) consumed.delete(id);
          }
          for (const knock of knocks) {
            if (!knock.id || consumed.has(knock.id)) continue;
            consumed.add(knock.id);
            // Une acceptation écrite avant cette ouverture de l'app ne remet
            // personne dans l'ancien vocal privé.
            const acceptedThisSession =
              knock.status === "accepted" &&
              !initial &&
              typeof knock.respondedAt === "number" &&
              knock.respondedAt >= startedAt;
            if (acceptedThisSession) {
              void useCallsStore
                .getState()
                .completeRemoteKnockJoin(workspaceId, knock.toUid, knock.id);
            } else if (!initial) {
              useCallsStore.getState().clearJoinRequest(workspaceId, knock.id);
            }
            void dismissVoiceKnock(workspaceId, knock.id);
          }
        },
        () => {},
      );
    });

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(workspaceIdsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const handledEjects = new Set<string>();
    const unsubs = workspaceIds.map((workspaceId) =>
      watchVoiceEjects(
        workspaceId,
        firebaseUid,
        (knock) => {
          if (handledEjects.has(knock.id)) return;
          handledEjects.add(knock.id);
          useCallsStore.getState().honorVoiceEject(workspaceId, knock.fromUid);
        },
        () => {},
      ),
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [firebaseUid, isAuthenticated, workspaceIdsKey]);
}
