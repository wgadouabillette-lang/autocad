import { useEffect, useRef } from "react";
import { monitorStreamVoiceActivity } from "../lib/voiceActivityMonitor";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";

const LOCAL_PARTICIPANT_ID = "local";
const SPEAKING_PRESENCE_HOLD_MS = 450;

export function useCallVoiceActivity(active: boolean): void {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const localStream = useCallsStore((s) => s.localStream);
  const muted = useCallsStore((s) => s.muted);
  const markParticipantVoiceActivity = useCallsStore((s) => s.markParticipantVoiceActivity);
  const pushLocalSpeakingPresence = useCallsStore((s) => s.pushLocalSpeakingPresence);
  const falseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearFalseTimer = () => {
      if (falseTimerRef.current !== null) {
        window.clearTimeout(falseTimerRef.current);
        falseTimerRef.current = null;
      }
    };

    const pushSpeaking = (speaking: boolean) => {
      if (!activeRoomId || !firebaseUid) return;
      clearFalseTimer();
      if (speaking) {
        pushLocalSpeakingPresence(activeRoomId, true);
        return;
      }
      falseTimerRef.current = window.setTimeout(() => {
        pushLocalSpeakingPresence(activeRoomId, false);
        falseTimerRef.current = null;
      }, SPEAKING_PRESENCE_HOLD_MS);
    };

    const markSpeaking = (speaking: boolean) => {
      markParticipantVoiceActivity(LOCAL_PARTICIPANT_ID, speaking);
      if (firebaseUid) {
        markParticipantVoiceActivity(firebaseUid, speaking);
      }
      pushSpeaking(speaking);
    };

    if (!active || muted || !localStream) {
      markSpeaking(false);
      return clearFalseTimer;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks.some((track) => track.enabled)) {
      markSpeaking(false);
      return clearFalseTimer;
    }

    const stopMonitor = monitorStreamVoiceActivity(localStream, markSpeaking);
    return () => {
      clearFalseTimer();
      stopMonitor();
    };
  }, [
    active,
    activeRoomId,
    firebaseUid,
    localStream,
    muted,
    markParticipantVoiceActivity,
    pushLocalSpeakingPresence,
  ]);
}
