import { useEffect } from "react";
import { monitorStreamVoiceActivity } from "../lib/voiceActivityMonitor";
import { useCallsStore } from "../store/useCallsStore";

const LOCAL_PARTICIPANT_ID = "local";

export function useCallVoiceActivity(active: boolean): void {
  const localStream = useCallsStore((s) => s.localStream);
  const muted = useCallsStore((s) => s.muted);
  const markParticipantVoiceActivity = useCallsStore((s) => s.markParticipantVoiceActivity);

  useEffect(() => {
    if (!active || muted || !localStream) {
      markParticipantVoiceActivity(LOCAL_PARTICIPANT_ID, false);
      return;
    }

    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks.some((track) => track.enabled)) {
      markParticipantVoiceActivity(LOCAL_PARTICIPANT_ID, false);
      return;
    }

    return monitorStreamVoiceActivity(localStream, (speaking) => {
      markParticipantVoiceActivity(LOCAL_PARTICIPANT_ID, speaking);
    });
  }, [active, localStream, muted, markParticipantVoiceActivity]);
}
