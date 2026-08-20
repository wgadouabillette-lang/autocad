import { useEffect } from "react";
import {
  watchSharedWorkspace,
  watchWorkspaceMembers,
} from "../lib/firebase/workspaceRegistry";
import {
  markWorkspacePresenceAway,
  touchWorkspacePresence,
  watchWorkspacePresence,
} from "../lib/firebase/workspacePresence";
import { createPresenceHeartbeat } from "../lib/firebase/workspacePresenceHeartbeat";
import { getLocalPresenceActivityForSync } from "../lib/localPresenceActivity";
import { getLocalSpotifyNowPlayingForSync } from "../lib/spotifyNowPlaying";
import { presenceActivityKey } from "../lib/presenceActivity";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore, buildLocalVoicePresenceForWorkspace } from "../store/useCallsStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useStore } from "../store/useStore";
import { useWorkspacePresenceStore } from "../store/useWorkspacePresenceStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import {
  useWorkspaceListenTargetIds,
  workspaceListenTargetsKey,
} from "./useWorkspaceListenTargetIds";

function syncCallsFromPresenceStore(workspaceId: string, localFirebaseUid: string) {
  const members = useWorkspacePresenceStore.getState().membersByWorkspace[workspaceId] ?? {};
  const memberRows = Object.entries(members).map(([id, entry]) => ({
    id,
    name: entry.displayName,
    photoURL: entry.photoURL,
    voice: entry.voice,
  }));
  useCallsStore.getState().syncPresenceMembers(workspaceId, memberRows, localFirebaseUid);
}

function workspaceIdsFromKey(key: string): string[] {
  return key ? key.split("\n") : [];
}

function isLocalInVoiceSession(workspaceId: string): boolean {
  const calls = useCallsStore.getState();
  return (
    calls.isLocalInCall(workspaceId) ||
    !!calls.localOpenChannelByRoom[workspaceId] ||
    calls.isLocalInTheaterCall(workspaceId)
  );
}

/**
 * Écrit la présence uniquement sur le workspace ouvert.
 * Exception: un WS où on est encore en vocal reste actif même si l'UI a changé.
 */
function presenceWriteTargets(joinedIds: string[], activeRoomId: string): string[] {
  const targets = new Set<string>();
  if (activeRoomId && joinedIds.includes(activeRoomId)) {
    targets.add(activeRoomId);
  }
  for (const workspaceId of joinedIds) {
    if (isLocalInVoiceSession(workspaceId)) targets.add(workspaceId);
  }
  return [...targets];
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
  const listenTargetIds = useWorkspaceListenTargetIds(ownerUserId);
  const listenTargetsKey = workspaceListenTargetsKey(listenTargetIds);

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(workspaceIdsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    const profile = {
      displayName: userDisplayName.trim() || "Membre",
      photoURL: photoURL ?? undefined,
    };

    let liveTargets: string[] = [];

    const pushPresence = (workspaceId: string) => {
      const calls = useCallsStore.getState();
      const inVoice =
        calls.isLocalInCall(workspaceId) || calls.isLocalInTheaterCall(workspaceId);
      const voice = inVoice
        ? buildLocalVoicePresenceForWorkspace(workspaceId)
        : { inPrivateCall: false, openChannelId: null };
      const activity = getLocalPresenceActivityForSync(workspaceId);
      const spotifyNowPlaying = getLocalSpotifyNowPlayingForSync(workspaceId);
      return touchWorkspacePresence(
        workspaceId,
        firebaseUid,
        profile,
        voice,
        activity,
        spotifyNowPlaying,
      );
    };

    const syncWriteTargets = () => {
      const nextTargets = presenceWriteTargets(
        workspaceIds,
        useStore.getState().activeRoomId,
      );
      const nextSet = new Set(nextTargets);
      const left = liveTargets.filter((id) => !nextSet.has(id));
      liveTargets = nextTargets;
      for (const workspaceId of left) {
        void markWorkspacePresenceAway(workspaceId, firebaseUid);
      }
      return nextTargets;
    };

    const heartbeat = () => {
      const targets = syncWriteTargets();
      if (targets.length === 0) return;
      void Promise.all(targets.map((workspaceId) => pushPresence(workspaceId)));
    };

    const scheduler = createPresenceHeartbeat({
      isHighFrequency: () => liveTargets.some((id) => isLocalInVoiceSession(id)),
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

    const unsubActiveRoom = useStore.subscribe((state, previous) => {
      if (state.activeRoomId === previous.activeRoomId) return;
      scheduler.pulse();
      scheduler.reschedule();
    });

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
        liveTargets.map((workspaceId) => byKey[presenceActivityKey(workspaceId, "local")] ?? null),
      );
      if (snapshot === activitySnapshotRef.current) return;
      activitySnapshotRef.current = snapshot;
      scheduler.pulse();
    });

    const spotifySnapshotRef = { current: "" };
    const unsubSpotify = useSpotifyPlayerStore.subscribe(() => {
      const { playing, currentTrack } = useSpotifyPlayerStore.getState();
      const snapshot = JSON.stringify({
        playing,
        trackId: currentTrack?.id ?? null,
        trackName: currentTrack?.name ?? null,
        artists: currentTrack?.artists ?? null,
        imageUrl: currentTrack?.imageUrl ?? null,
      });
      if (snapshot === spotifySnapshotRef.current) return;
      spotifySnapshotRef.current = snapshot;
      scheduler.pulse();
    });

    return () => {
      scheduler.stop();
      document.removeEventListener("visibilitychange", onVisible);
      unsubActiveRoom();
      unsubCalls();
      unsubActivity();
      unsubSpotify();
      for (const workspaceId of liveTargets) {
        void markWorkspacePresenceAway(workspaceId, firebaseUid);
      }
    };
  }, [firebaseUid, isAuthenticated, userDisplayName, photoURL, workspaceIdsKey]);

  useEffect(() => {
    const workspaceIds = workspaceIdsFromKey(listenTargetsKey);
    if (!isAuthenticated || !firebaseUid || workspaceIds.length === 0) return;

    type RosterPerson = { uid: string; displayName: string; photoURL?: string };
    const rosterState = new Map<
      string,
      { members: RosterPerson[]; owner: RosterPerson | null }
    >();

    const publishRoster = (workspaceId: string) => {
      const state = rosterState.get(workspaceId);
      if (!state) return;
      const byUid = new Map<string, RosterPerson>();
      for (const member of state.members) {
        byUid.set(member.uid, member);
      }
      if (state.owner && !byUid.has(state.owner.uid)) {
        byUid.set(state.owner.uid, state.owner);
      }
      useWorkspacePresenceStore.getState().setWorkspaceRoster(
        workspaceId,
        Array.from(byUid.values()),
      );
      syncCallsFromPresenceStore(workspaceId, firebaseUid);
    };

    const ensureState = (workspaceId: string) => {
      let state = rosterState.get(workspaceId);
      if (!state) {
        state = { members: [], owner: null };
        rosterState.set(workspaceId, state);
      }
      return state;
    };

    const unsubs = workspaceIds.flatMap((workspaceId) => {
      const unsubMembers = watchWorkspaceMembers(
        workspaceId,
        (members) => {
          const state = ensureState(workspaceId);
          state.members = members.map((member) => ({
            uid: member.uid,
            displayName: member.displayName,
          }));
          publishRoster(workspaceId);
        },
        () => {
          // Permission/network errors — keep last known roster.
        },
      );

      const unsubShared = watchSharedWorkspace(
        workspaceId,
        (workspace) => {
          if (!workspace?.ownerId) return;
          const state = ensureState(workspaceId);
          state.owner = {
            uid: workspace.ownerId,
            displayName: workspace.ownerName?.trim() || "Membre",
          };
          publishRoster(workspaceId);
        },
        () => {
          // Ignore shared workspace watch errors.
        },
      );

      const unsubPresence = watchWorkspacePresence(
        workspaceId,
        (members) => {
          useWorkspacePresenceStore.getState().setWorkspacePresence(
            workspaceId,
            members.map((member) => ({
              uid: member.uid,
              displayName: member.displayName,
              photoURL: member.photoURL,
              lastSeenMs: member.lastSeenMs,
              online: member.online,
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
            usePresenceActivityStore.getState().syncRemoteSpotifyNowPlaying(
              workspaceId,
              member.uid,
              member.spotifyNowPlaying,
            );
          }
          syncCallsFromPresenceStore(workspaceId, firebaseUid);
        },
        () => {
          useWorkspacePresenceStore.getState().setWorkspacePresence(workspaceId, []);
        },
      );

      return [unsubMembers, unsubShared, unsubPresence];
    });

    return () => {
      for (const unsub of unsubs) unsub();
      for (const workspaceId of workspaceIds) {
        useWorkspacePresenceStore.getState().clearWorkspacePresence(workspaceId);
      }
    };
  }, [firebaseUid, isAuthenticated, listenTargetsKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setInterval(() => {
      useWorkspacePresenceStore.getState().tickPresence();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated]);
}
