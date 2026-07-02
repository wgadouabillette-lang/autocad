import { useCallsStore } from "../store/useCallsStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { useTheaterChatStore } from "../store/useTheaterChatStore";
import { useVoicePollStore } from "../store/useVoicePollStore";
import { useWorkspacePresenceStore } from "../store/useWorkspacePresenceStore";
import { useWorkspaceTextChannelsStore } from "../store/useWorkspaceTextChannelsStore";

export function normalizeReleasedWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase();
}

export function releaseWorkspaceClientResources(workspaceId: string): void {
  const normalized = normalizeReleasedWorkspaceId(workspaceId);
  if (!normalized) return;

  useWorkspacePresenceStore.getState().clearWorkspacePresence(normalized);
  useWorkspaceTextChannelsStore.getState().clearWorkspace(normalized);
  useVoicePollStore.getState().clearWorkspace(normalized);
  useTheaterChatStore.getState().clearWorkspace(normalized);
  useCallsStore.getState().clearWorkspaceResources(normalized);
  usePeopleStore.getState().clearWorkspaceResources(normalized);
}

/** Lets React effect cleanups detach Firestore listeners before doc deletion. */
export function waitForFirestoreListenerRelease(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 50);
      });
    });
  });
}
