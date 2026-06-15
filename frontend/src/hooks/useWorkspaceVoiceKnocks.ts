import { useEffect, useRef } from "react";
import { memberBlockId } from "../lib/calls";
import {
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

function knockToJoinRequest(workspaceId: string, knock: VoiceKnockDoc, localUid: string) {
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
    status: knock.status,
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
  const handledResponsesRef = useRef<Set<string>>(new Set());

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
          useCallsStore.getState().syncRemoteJoinRequests(workspaceId, []);
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

    const unsubs = workspaceIds.map((workspaceId) =>
      watchVoiceKnockResponses(
        workspaceId,
        firebaseUid,
        (knocks) => {
          for (const knock of knocks) {
            if (handledResponsesRef.current.has(knock.id)) continue;
            handledResponsesRef.current.add(knock.id);
            if (knock.status === "accepted") {
              void useCallsStore
                .getState()
                .completeRemoteKnockJoin(workspaceId, knock.toUid);
            } else {
              useCallsStore.getState().clearJoinRequest(workspaceId, knock.id);
            }
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
