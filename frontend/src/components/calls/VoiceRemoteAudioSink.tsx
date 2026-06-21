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
    audio.volume = 1;

    const play = () => {
      void audio.play().catch(() => {});
    };

    play();
    stream.addEventListener("addtrack", play);
    audio.addEventListener("canplay", play);

    const resumeOnGesture = () => {
      play();
    };
    document.addEventListener("pointerdown", resumeOnGesture, true);
    document.addEventListener("keydown", resumeOnGesture, true);

    return () => {
      stream.removeEventListener("addtrack", play);
      audio.removeEventListener("canplay", play);
      document.removeEventListener("pointerdown", resumeOnGesture, true);
      document.removeEventListener("keydown", resumeOnGesture, true);
      if (audio.srcObject === stream) {
        audio.srcObject = null;
      }
    };
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
  const deafen = useCallsStore((s) => s.deafen);

  if (!inCall) return null;

  const audioMuted = deafen;

  return (
    <>
      {Object.entries(remoteMediaByUid).map(([uid, media]: [string, RemoteParticipantStreams]) =>
        media.audioStream ? (
          <RemoteAudioPlayer
            key={`${uid}:${media.audioStream.id}`}
            uid={uid}
            stream={media.audioStream}
            muted={audioMuted}
          />
        ) : null,
      )}
    </>
  );
}
