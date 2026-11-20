import { useEffect, useRef, useState } from "react";
import {
  joinDirectCallRoom,
  leaveDirectCallRoom,
  touchDirectCallRoom,
  watchDirectCallPeers,
  directCallRtcTransport,
} from "../lib/firebase/directCallRoom";
import { WorkspaceVoiceRtcSession } from "../lib/webrtc/workspaceVoiceRtc";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useDirectCallStore } from "../store/useDirectCallStore";
import { useStore } from "../store/useStore";

function workspaceVoiceActive(roomId: string): boolean {
  const calls = useCallsStore.getState();
  return (
    calls.isLocalInCall(roomId) ||
    calls.isLocalInTheaterCall(roomId) ||
    Boolean(calls.localOpenChannelByRoom[roomId])
  );
}

export function useDirectCallRtc() {
  const callId = useDirectCallStore((s) => s.callId);
  const peerKey = useDirectCallStore((s) => s.peers.map((peer) => peer.uid).join("\n"));
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const localStream = useCallsStore((s) => s.localStream);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const muted = useCallsStore((s) => s.muted);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);

  const [joinedCallId, setJoinedCallId] = useState<string | null>(null);

  useEffect(() => {
    if (!callId || !firebaseUid || !isAuthenticated) {
      setJoinedCallId(null);
      return;
    }
    let cancelled = false;
    let unsub = () => {};
    let beat = 0;

    void (async () => {
      try {
        const name = useStore.getState().userDisplayName.trim() || "Membre";
        await joinDirectCallRoom(callId, firebaseUid, name);
      } catch (error) {
        console.warn("[direct-call] join failed", error);
        return;
      }
      if (cancelled) {
        await leaveDirectCallRoom(callId, firebaseUid).catch(() => {});
        return;
      }
      setJoinedCallId(callId);
      const live = useCallsStore
        .getState()
        .localStream?.getAudioTracks()
        .some((track) => track.readyState === "live");
      if (!live) void useCallsStore.getState().startLocalMedia();
      unsub = watchDirectCallPeers(callId, firebaseUid, (peers) => {
        useDirectCallStore.getState().setPeers(peers);
      });
      beat = window.setInterval(() => {
        void touchDirectCallRoom(callId, firebaseUid).catch(() => {});
      }, 20_000);
    })();

    return () => {
      cancelled = true;
      setJoinedCallId(null);
      window.clearInterval(beat);
      unsub();
      useDirectCallStore.getState().setPeers([]);
      useDirectCallStore.getState().clearRemoteMedia();
      void leaveDirectCallRoom(callId, firebaseUid).catch(() => {});
      const roomId = useStore.getState().activeRoomId;
      if (!workspaceVoiceActive(roomId)) {
        useCallsStore.getState().stopLocalMediaTracks();
      }
    };
  }, [callId, firebaseUid, isAuthenticated]);

  const sessionRef = useRef<WorkspaceVoiceRtcSession | null>(null);
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!callId || !firebaseUid || !isAuthenticated || joinedCallId !== callId) {
      sessionRef.current?.close();
      sessionRef.current = null;
      sessionKeyRef.current = null;
      return;
    }

    const sessionKey = `direct:${callId}`;
    if (sessionKeyRef.current !== sessionKey) {
      sessionRef.current?.close();
      useDirectCallStore.getState().clearRemoteMedia();
      const session = new WorkspaceVoiceRtcSession(
        "direct",
        callId,
        firebaseUid,
        (uid, media) => {
          useDirectCallStore.getState().setRemoteMedia(uid, media);
        },
        (uid) => {
          useDirectCallStore.getState().removeRemoteMedia(uid);
        },
        directCallRtcTransport(callId, firebaseUid),
      );
      session.start();
      sessionRef.current = session;
      sessionKeyRef.current = sessionKey;
    }

    const peerUids = peerKey ? peerKey.split("\n") : [];
    void sessionRef.current?.setPeerUids(peerUids).then(() => {
      if (!sessionRef.current) return;
      void sessionRef.current.syncLocalMedia({
        localStream,
        screenShareStream,
        muted,
        cameraOn,
        screenSharing,
      });
    });
  }, [
    callId,
    firebaseUid,
    isAuthenticated,
    peerKey,
    localStream,
    screenShareStream,
    muted,
    cameraOn,
    screenSharing,
    joinedCallId,
  ]);

  useEffect(
    () => () => {
      sessionRef.current?.close();
      sessionRef.current = null;
      sessionKeyRef.current = null;
    },
    [],
  );
}
