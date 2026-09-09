import { Fragment, useEffect, useRef } from "react";
import { applyAudioOutputToElement } from "../../lib/audioDevices";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import type { RemoteParticipantStreams } from "../../lib/webrtc/workspaceVoiceRtc";

let sharedAudioUnlock: AudioContext | null = null;

function unlockAudioPlayback(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!sharedAudioUnlock) sharedAudioUnlock = new AC();
    if (sharedAudioUnlock.state === "suspended") {
      void sharedAudioUnlock.resume().catch(() => {});
    }
  } catch {
    // Ignore — HTMLAudioElement.play() remains the primary path.
  }
}

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

    unlockAudioPlayback();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.muted = muted;
    audio.volume = Math.min(1, Math.max(0, volume));

    const play = () => {
      unlockAudioPlayback();
      void audio.play().catch((err) => {
        console.warn("[voice] remote audio play blocked", uid, err);
      });
    };

    void applyAudioOutputToElement(audio, outputDeviceId).finally(play);

    stream.addEventListener("addtrack", play);
    audio.addEventListener("canplay", play);
    audio.addEventListener("loadedmetadata", play);

    const trackHandlers: Array<{ track: MediaStreamTrack; handler: () => void }> = [];
    for (const track of stream.getAudioTracks()) {
      const handler = () => play();
      track.addEventListener("unmute", handler);
      track.addEventListener("ended", handler);
      trackHandlers.push({ track, handler });
      // Some Chromium builds deliver tracks already muted until a later unmute.
      if (track.muted) {
        track.addEventListener("unmute", handler, { once: true });
      }
    }

    const resumeOnGesture = () => {
      play();
    };
    document.addEventListener("pointerdown", resumeOnGesture, true);
    document.addEventListener("keydown", resumeOnGesture, true);

    const watchdog = window.setInterval(() => {
      if (audio.paused && !audio.muted && stream.getAudioTracks().some((t) => t.readyState === "live")) {
        play();
      }
    }, 2000);

    return () => {
      window.clearInterval(watchdog);
      stream.removeEventListener("addtrack", play);
      audio.removeEventListener("canplay", play);
      audio.removeEventListener("loadedmetadata", play);
      for (const { track, handler } of trackHandlers) {
        track.removeEventListener("unmute", handler);
        track.removeEventListener("ended", handler);
      }
      document.removeEventListener("pointerdown", resumeOnGesture, true);
      document.removeEventListener("keydown", resumeOnGesture, true);
      if (audio.srcObject === stream) {
        audio.srcObject = null;
      }
    };
  }, [stream, muted, outputDeviceId, uid]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.muted = muted || volume <= 0.001;
    if (!audio.muted && audio.paused) {
      void audio.play().catch(() => {});
    }
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

  useEffect(() => {
    if (!inVoice) return;
    unlockAudioPlayback();
    const onGesture = () => unlockAudioPlayback();
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    return () => {
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    };
  }, [inVoice]);

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
