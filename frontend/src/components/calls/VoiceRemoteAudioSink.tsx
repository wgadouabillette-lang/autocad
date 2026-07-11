import { Fragment, useEffect, useRef } from "react";
import { applyAudioOutputToElement } from "../../lib/audioDevices";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import type { RemoteParticipantStreams } from "../../lib/webrtc/workspaceVoiceRtc";

function RemoteAudioPlayer({
  uid,
  stream,
  muted,
  volume,
  outputDeviceId,
}: {
  uid: string;
  stream: MediaStream;
  muted: boolean;
  volume: number;
  outputDeviceId: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    audio.srcObject = stream;
    audio.muted = muted;
    audio.volume = Math.min(1, Math.max(0, volume));

    const play = () => {
      void audio.play().catch(() => {});
    };

    void applyAudioOutputToElement(audio, outputDeviceId).then(play);

    stream.addEventListener("addtrack", play);
    audio.addEventListener("canplay", play);

    const trackHandlers: Array<{ track: MediaStreamTrack; handler: () => void }> = [];
    for (const track of stream.getAudioTracks()) {
      const handler = () => play();
      track.addEventListener("unmute", handler);
      trackHandlers.push({ track, handler });
    }

    const resumeOnGesture = () => {
      play();
    };
    document.addEventListener("pointerdown", resumeOnGesture, true);
    document.addEventListener("keydown", resumeOnGesture, true);

    return () => {
      stream.removeEventListener("addtrack", play);
      audio.removeEventListener("canplay", play);
      for (const { track, handler } of trackHandlers) {
        track.removeEventListener("unmute", handler);
      }
      document.removeEventListener("pointerdown", resumeOnGesture, true);
      document.removeEventListener("keydown", resumeOnGesture, true);
      if (audio.srcObject === stream) {
        audio.srcObject = null;
      }
    };
  }, [stream, muted, outputDeviceId]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.muted = muted || volume <= 0.001;
  }, [volume, muted]);

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

/** Joue l'audio distant — indépendant de la vue affichée (salon ouvert, grille, théâtre, etc.). */
export default function VoiceRemoteAudioSink() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const audioOutputDeviceId = useStore((s) => s.audioOutputDeviceId);
  const callsViewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inBlockCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const inTheaterCall = useCallsStore((s) => s.isLocalInTheaterCall(activeRoomId));
  const inVoice = callsViewMode === "theater" ? inTheaterCall : inBlockCall;
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const deafen = useCallsStore((s) => s.deafen);
  const remoteScreenShareVolume = useCallsStore((s) => s.remoteScreenShareVolume);

  if (!inVoice) return null;

  const audioMuted = deafen;

  return (
    <>
      {Object.entries(remoteMediaByUid).map(([uid, media]: [string, RemoteParticipantStreams]) => (
        <Fragment key={uid}>
          {media.audioStream ? (
            <RemoteAudioPlayer
              key={`${uid}:mic:${media.audioStream.id}`}
              uid={uid}
              stream={media.audioStream}
              muted={audioMuted}
              volume={1}
              outputDeviceId={audioOutputDeviceId}
            />
          ) : null}
          {media.screenAudioStream ? (
            <RemoteAudioPlayer
              key={`${uid}:screen:${media.screenAudioStream.id}`}
              uid={`${uid}-screen`}
              stream={media.screenAudioStream}
              muted={audioMuted}
              volume={remoteScreenShareVolume}
              outputDeviceId={audioOutputDeviceId}
            />
          ) : null}
        </Fragment>
      ))}
    </>
  );
}
