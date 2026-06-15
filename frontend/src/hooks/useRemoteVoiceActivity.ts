import { useEffect, useMemo } from "react";
import { monitorStreamVoiceActivity } from "../lib/voiceActivityMonitor";
import type { RemoteParticipantStreams } from "../lib/webrtc/workspaceVoiceRtc";
import { useCallsStore } from "../store/useCallsStore";

function remoteAudioMediaKey(
  remoteMediaByUid: Record<string, RemoteParticipantStreams>,
): string {
  return Object.entries(remoteMediaByUid)
    .map(([uid, media]) => `${uid}:${media.audioStream?.id ?? ""}`)
    .sort()
    .join("|");
}

/** Détecte la parole des participants distants via le flux WebRTC reçu. */
export function useRemoteVoiceActivity(active: boolean): void {
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const markParticipantVoiceActivity = useCallsStore((s) => s.markParticipantVoiceActivity);
  const mediaKey = useMemo(
    () => remoteAudioMediaKey(remoteMediaByUid),
    [remoteMediaByUid],
  );

  useEffect(() => {
    if (!active) return;

    const monitors = new Map<string, () => void>();

    for (const [uid, media] of Object.entries(remoteMediaByUid)) {
      if (!media.audioStream) {
        markParticipantVoiceActivity(uid, false);
        continue;
      }
      const stop = monitorStreamVoiceActivity(media.audioStream, (speaking) => {
        markParticipantVoiceActivity(uid, speaking);
      });
      monitors.set(uid, stop);
    }

    return () => {
      for (const [uid, stop] of monitors) {
        stop();
        markParticipantVoiceActivity(uid, false);
      }
    };
  }, [active, mediaKey, remoteMediaByUid, markParticipantVoiceActivity]);
}
