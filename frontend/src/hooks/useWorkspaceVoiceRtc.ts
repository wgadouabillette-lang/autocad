import { useEffect, useMemo, useRef } from "react";
import { resolveVoiceRtcContext } from "../lib/webrtc/voiceSession";
import { WorkspaceVoiceRtcSession } from "../lib/webrtc/workspaceVoiceRtc";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";

export function useWorkspaceVoiceRtc() {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const inCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const localStream = useCallsStore((s) => s.localStream);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const muted = useCallsStore((s) => s.muted);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);

  const rtcContext = useMemo(() => {
    if (!isAuthenticated || !firebaseUid || !inCall) return null;
    return resolveVoiceRtcContext({
      workspaceId: activeRoomId,
      roomCalls,
      localInCall: inCall,
      localOpenChannelId: localOpenChannelId ?? null,
      localFirebaseUid: firebaseUid,
    });
  }, [
    isAuthenticated,
    firebaseUid,
    activeRoomId,
    inCall,
    localOpenChannelId,
    roomCalls?.blocks,
    roomCalls?.openChannels,
  ]);

  const sessionRef = useRef<WorkspaceVoiceRtcSession | null>(null);
  const sessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rtcContext) {
      sessionRef.current?.close();
      sessionRef.current = null;
      sessionKeyRef.current = null;
      useCallsStore.getState().clearAllRemoteMedia();
      return;
    }

    const sessionKey = `${rtcContext.workspaceId}:${rtcContext.sessionId}`;
    if (sessionKeyRef.current !== sessionKey) {
      sessionRef.current?.close();
      useCallsStore.getState().clearAllRemoteMedia();
      const session = new WorkspaceVoiceRtcSession(
        rtcContext.workspaceId,
        rtcContext.sessionId,
        firebaseUid!,
        (uid, media) => {
          useCallsStore.getState().setRemoteParticipantMedia(uid, media);
        },
        (uid) => {
          useCallsStore.getState().removeRemoteParticipantMedia(uid);
        },
      );
      session.start();
      sessionRef.current = session;
      sessionKeyRef.current = sessionKey;
    }

    void sessionRef.current?.setPeerUids(rtcContext.peerUids).then(() => {
      if (!sessionRef.current) return;
      void sessionRef.current.syncLocalMedia({
        localStream,
        screenShareStream,
        muted,
        cameraOn,
        screenSharing,
      });
    });
  }, [rtcContext, firebaseUid, localStream, screenShareStream, muted, cameraOn, screenSharing]);

  useEffect(
    () => () => {
      sessionRef.current?.close();
      sessionRef.current = null;
      sessionKeyRef.current = null;
    },
    [],
  );
}
