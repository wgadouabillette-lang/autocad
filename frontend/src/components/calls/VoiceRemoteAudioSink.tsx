import { useEffect, useRef } from "react";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import type { RemoteParticipantStreams } from "../../lib/webrtc/workspaceVoiceRtc";

function RemoteAudioPlayer({
  uid,
  stream,
  muted,
}: {
  uid: string;
  stream: MediaStream;
  muted: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.muted = muted;
    void audio.play().catch(() => {});
  }, [stream, muted]);

  return (
    <audio
      ref={ref}
      data-remote-uid={uid}
      autoPlay
      playsInline
      className="sr-only"
      aria-hidden
    />
  );
}

/** Joue l'audio distant — indépendant de la vue affichée (salon ouvert, grille, etc.). */
export default function VoiceRemoteAudioSink() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const inCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const muteOthers = useCallsStore((s) => s.muteOthers);
  const deafen = useCallsStore((s) => s.deafen);

  if (!inCall) return null;

  const audioMuted = muteOthers || deafen;

  return (
    <>
      {Object.entries(remoteMediaByUid).map(([uid, media]: [string, RemoteParticipantStreams]) =>
        media.audioStream ? (
          <RemoteAudioPlayer
            key={uid}
            uid={uid}
            stream={media.audioStream}
            muted={audioMuted}
          />
        ) : null,
      )}
    </>
  );
}
