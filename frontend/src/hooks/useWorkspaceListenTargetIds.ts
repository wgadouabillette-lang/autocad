import { useMemo } from "react";
import type { TheaterState } from "../lib/theater";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";

/** Workspaces where the local user is currently in a voice/theater session. */
export function localVoiceWorkspaceIds(
  localInCallByRoom: Record<string, boolean>,
  localOpenChannelByRoom: Record<string, string | null>,
  theaterByWorkspace: Record<string, TheaterState | undefined>,
): string[] {
  const ids = new Set<string>();
  for (const [workspaceId, inCall] of Object.entries(localInCallByRoom)) {
    if (inCall) ids.add(workspaceId);
  }
  for (const [workspaceId, channelId] of Object.entries(localOpenChannelByRoom)) {
    if (channelId) ids.add(workspaceId);
  }
  for (const [workspaceId, theater] of Object.entries(theaterByWorkspace)) {
    if (theater?.localRole) ids.add(workspaceId);
  }
  return [...ids];
}

/**
 * Listen targets = active room (if joined) + any voice-active joined rooms.
 * Matches presence write targeting so background workspaces stop costing listeners.
 */
export function computeWorkspaceListenTargets(
  joinedIds: string[],
  activeRoomId: string,
  voiceIds: string[],
): string[] {
  const joined = new Set(
    joinedIds.map((id) => id.trim().toLowerCase()).filter(Boolean),
  );
  const targets = new Set<string>();
  const active = activeRoomId.trim().toLowerCase();
  if (active && joined.has(active)) targets.add(active);
  for (const id of voiceIds) {
    const normalized = id.trim().toLowerCase();
    if (normalized && joined.has(normalized)) targets.add(normalized);
  }
  return [...targets].sort();
}

/** Reactive list of workspace ids that should keep live Firebase listeners. */
export function useWorkspaceListenTargetIds(ownerUserId: string): string[] {
  const joinedIdsKey = useWorkspacesStore((s) =>
    s
      .joinedWorkspaces(ownerUserId)
      .map((workspace) => workspace.id)
      .sort()
      .join("\n"),
  );
  const activeRoomId = useStore((s) => s.activeRoomId);
  const voiceKey = useCallsStore((s) => {
    const ids = localVoiceWorkspaceIds(
      s.localInCallByRoom,
      s.localOpenChannelByRoom,
      s.theaterByWorkspace,
    );
    return ids.sort().join("\n");
  });

  return useMemo(() => {
    const joinedIds = joinedIdsKey ? joinedIdsKey.split("\n") : [];
    const voiceIds = voiceKey ? voiceKey.split("\n") : [];
    return computeWorkspaceListenTargets(joinedIds, activeRoomId, voiceIds);
  }, [joinedIdsKey, activeRoomId, voiceKey]);
}

export function workspaceListenTargetsKey(ids: string[]): string {
  return ids.join("\n");
}
