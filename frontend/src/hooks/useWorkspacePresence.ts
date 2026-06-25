import { useEffect } from "react";
import { touchWorkspacePresence, watchWorkspacePresence } from "../lib/firebase/workspacePresence";
import { createPresenceHeartbeat } from "../lib/firebase/workspacePresenceHeartbeat";
import { getLocalPresenceActivityForSync } from "../lib/localPresenceActivity";
import { presenceActivityKey } from "../lib/presenceActivity";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore, buildLocalVoicePresenceForWorkspace } from "../store/useCallsStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useStore } from "../store/useStore";
import { useWorkspacePresenceStore } from "../store/useWorkspacePresenceStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

function isLocalInAnyVoiceSession(workspaceIds: string[]): boolean {
  const calls = useCallsStore.getState();
  return workspaceIds.some(
    (workspaceId) =>
      calls.isLocalInCall(workspaceId) ||
      !!calls.localOpenChannelByRoom[workspaceId] ||
      calls.isLocalInTheaterCall(workspaceId),
  );
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

    const pushPresence = (workspaceId: string) => {
      const calls = useCallsStore.getState();
      const inVoice =
        calls.isLocalInCall(workspaceId) || calls.isLocalInTheaterCall(workspaceId);
      const voice = inVoice
        ? buildLocalVoicePresenceForWorkspace(workspaceId)
        : { inPrivateCall: false, openChannelId: null };
      const activity = getLocalPresenceActivityForSync(workspaceId);
      return touchWorkspacePresence(workspaceId, firebaseUid, profile, voice, activity);
    };

    const heartbeat = () => {
      void Promise.all(workspaceIds.map((workspaceId) => pushPresence(workspaceId)));
    };

    const scheduler = createPresenceHeartbeat({
      isHighFrequency: () => isLocalInAnyVoiceSession(workspaceIds),
      onPulse: heartbeat,
    });

    scheduler.pulse();
    scheduler.reschedule();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        scheduler.pulse();
        scheduler.reschedule();
        return;
      }
      scheduler.stop();
    };
    document.addEventListener("visibilitychange", onVisible);

    const voiceSnapshotRef = { current: "" };
    const unsubCalls = useCallsStore.subscribe(() => {
      const state = useCallsStore.getState();
      const snapshot = JSON.stringify({
        inCall: state.localInCallByRoom,
        channels: state.localOpenChannelByRoom,
        viewMode: state.callsViewModeByWorkspace,
        muted: state.muted,
        raiseHand: state.raiseHand,
        theater: state.theaterByWorkspace,
      });
      if (snapshot === voiceSnapshotRef.current) return;
      voiceSnapshotRef.current = snapshot;
      scheduler.pulse();
      scheduler.reschedule();
    });

    const activitySnapshotRef = { current: "" };
    const unsubActivity = usePresenceActivityStore.subscribe(() => {
      const byKey = usePresenceActivityStore.getState().byKey;
      const snapshot = JSON.stringify(
        workspaceIds.map((workspaceId) => byKey[presenceActivityKey(workspaceId, "local")] ?? null),
      );
      if (snapshot === activitySnapshotRef.current) return;
      activitySnapshotRef.current = snapshot;
      scheduler.pulse();
    });

    const spotifySnapshotRef = { current: "" };
    const unsubSpotify = useSpotifyPlayerStore.subscribe(() => {
      const { playing, currentTrack } = useSpotifyPlayerStore.getState();
      const snapshot = JSON.stringify({ playing, trackId: currentTrack?.id ?? null });
      if (snapshot === spotifySnapshotRef.current) return;
      spotifySnapshotRef.current = snapshot;
      scheduler.pulse();
    });

    return () => {
      scheduler.stop();
      document.removeEventListener("visibilitychange", onVisible);
      unsubCalls();
      unsubActivity();
      unsubSpotify();
    };
  }, [firebaseUid, isAuthenticated, userDisplayName, photoURL, workspaceIdsKey]);

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(workspaceIdsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const unsubs = workspaceIds.map((workspaceId) =>
      watchWorkspacePresence(
        workspaceId,
        (members) => {
          useWorkspacePresenceStore.getState().setWorkspacePresence(
            workspaceId,
            members.map((member) => ({
              uid: member.uid,
              displayName: member.displayName,
              photoURL: member.photoURL,
              lastSeenMs: member.lastSeenMs,
              voice: member.voice,
            })),
          );
          for (const member of members) {
            if (member.uid === firebaseUid) continue;
            usePresenceActivityStore.getState().syncRemoteActivity(
              workspaceId,
              member.uid,
              member.presenceActivity,
            );
            useCallsStore.getState().markParticipantVoiceActivity(
              member.uid,
              member.voice.speaking === true,
            );
          }
          const memberRows = members.map((member) => ({
            id: member.uid,
            name: member.displayName,
            photoURL: member.photoURL,
            voice: member.voice,
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
