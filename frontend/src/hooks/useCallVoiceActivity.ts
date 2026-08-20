import { useEffect } from "react";
import { monitorStreamVoiceActivity } from "../lib/voiceActivityMonitor";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";

const LOCAL_PARTICIPANT_ID = "local";

/** Détecte la parole locale via le micro — état UI only (pas de write Firebase). */
export function useCallVoiceActivity(active: boolean): void {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const localStream = useCallsStore((s) => s.localStream);
  const muted = useCallsStore((s) => s.muted);
  const markParticipantVoiceActivity = useCallsStore((s) => s.markParticipantVoiceActivity);

  useEffect(() => {
    const markSpeaking = (speaking: boolean) => {
      markParticipantVoiceActivity(LOCAL_PARTICIPANT_ID, speaking);
      if (firebaseUid) {
        markParticipantVoiceActivity(firebaseUid, speaking);
      }
    };

    if (!active || muted || !localStream) {
      markSpeaking(false);
      return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks.some((track) => track.enabled)) {
      markSpeaking(false);
      return;
    }

    const stopMonitor = monitorStreamVoiceActivity(localStream, markSpeaking);
    return () => {
      stopMonitor();
    };
  }, [active, firebaseUid, localStream, muted, markParticipantVoiceActivity]);
}
