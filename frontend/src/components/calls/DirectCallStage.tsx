import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { avatarColor, userInitials } from "../../lib/calls";
import { participantVideoStream } from "../../lib/webrtc/workspaceVoiceRtc";
import { useCallsStore } from "../../store/useCallsStore";
import { useDirectCallStore } from "../../store/useDirectCallStore";
import { useStore } from "../../store/useStore";
import ParticipantVolumeControl from "./ParticipantVolumeControl";

function DirectCallAudio({ stream, volume }: { stream: MediaStream; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.srcObject = stream;
    audio.autoplay = true;
    const play = () => {
      void audio.play().catch(() => {});
    };
    play();
    stream.addEventListener("addtrack", play);
    return () => {
      stream.removeEventListener("addtrack", play);
      audio.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.muted = volume <= 0.001;
    if (!audio.muted && audio.paused) {
      void audio.play().catch(() => {});
    }
  }, [volume]);

  return <audio ref={ref} autoPlay playsInline />;
}

/** Appel 1:1 en cours. L’identifiant se copie depuis la barre du haut. */
export default function DirectCallStage() {
  const { t } = useTranslation();
  const callId = useDirectCallStore((s) => s.callId);
  const peers = useDirectCallStore((s) => s.peers);
  const remoteMediaByUid = useDirectCallStore((s) => s.remoteMediaByUid);
  const remoteVolumeByUid = useCallsStore((s) => s.remoteVolumeByUid);
  const name = useStore((s) => s.userDisplayName).trim() || t("common.you");

  if (!callId) return null;

  return (
    <div className="direct-call-stage">
      <div className="direct-call-stage__body">
        <article className="direct-call-stage__tile">
          <div className="direct-call-stage__avatar" style={{ backgroundColor: avatarColor("local") }}>
            {userInitials(name)}
          </div>
          <span className="direct-call-stage__name">{name}</span>
        </article>
        {peers.map((peer) => {
          const media = remoteMediaByUid[peer.uid];
          const video = participantVideoStream(media);
          return (
            <article key={peer.uid} className="direct-call-stage__tile">
              {video ? (
                <video
                  className="direct-call-stage__video"
                  autoPlay
                  playsInline
                  muted
                  ref={(node) => {
                    if (node && node.srcObject !== video) node.srcObject = video;
                  }}
                />
              ) : (
                <div
                  className="direct-call-stage__avatar"
                  style={{ backgroundColor: avatarColor(peer.uid) }}
                >
                  {userInitials(peer.displayName)}
                </div>
              )}
              <div className="direct-call-stage__name direct-call-stage__name--remote">
                <span className="direct-call-stage__name-text">{peer.displayName}</span>
                <ParticipantVolumeControl uid={peer.uid} name={peer.displayName} />
              </div>
              {media?.audioStream ? (
                <DirectCallAudio stream={media.audioStream} volume={remoteVolumeByUid[peer.uid] ?? 1} />
              ) : null}
              {media?.screenAudioStream ? (
                <DirectCallAudio
                  stream={media.screenAudioStream}
                  volume={remoteVolumeByUid[peer.uid] ?? 1}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
