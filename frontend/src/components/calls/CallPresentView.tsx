import clsx from "clsx";
import { useEffect, useRef } from "react";
import { MonitorUp, User, Video } from "lucide-react";
import {
  activeCallPartner,
  avatarColor,
  findLocalBlock,
  userInitials,
  type CallBlock,
} from "../../lib/calls";
import { participantVideoStream } from "../../lib/webrtc/workspaceVoiceRtc";
import { useCallsStore } from "../../store/useCallsStore";
import VoiceMuteBadge from "./VoiceMuteBadge";

interface CallPresentViewProps {
  blocks: CallBlock[];
}

export default function CallPresentView({ blocks }: CallPresentViewProps) {
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const localStream = useCallsStore((s) => s.localStream);
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const muted = useCallsStore((s) => s.muted);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const muteOthers = useCallsStore((s) => s.muteOthers);

  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const partnerVideoRef = useRef<HTMLVideoElement>(null);
  const partnerAudioRef = useRef<HTMLAudioElement>(null);

  const localBlock = findLocalBlock(blocks);
  const partner = activeCallPartner(blocks, localBlock);

  const showScreen = screenSharing && screenShareStream;
  const showCamera = !showScreen && cameraOn && localStream;
  const partnerMedia = partner ? remoteMediaByUid[partner.id] : undefined;
  const partnerVideoStream = participantVideoStream(partnerMedia);
  const showPartnerVideo = !!partnerVideoStream;

  useEffect(() => {
    const video = primaryVideoRef.current;
    if (!video) return;
    if (showScreen) {
      video.srcObject = screenShareStream;
      return;
    }
    if (showCamera) {
      video.srcObject = localStream;
      return;
    }
    video.srcObject = null;
  }, [showScreen, showCamera, screenShareStream, localStream]);

  useEffect(() => {
    const video = partnerVideoRef.current;
    if (!video) return;
    video.srcObject = showPartnerVideo ? partnerVideoStream : null;
  }, [showPartnerVideo, partnerVideoStream]);

  useEffect(() => {
    const audio = partnerAudioRef.current;
    if (!audio || !partner) return;
    audio.srcObject = partnerMedia?.audioStream ?? null;
    audio.muted = muteOthers;
  }, [partner, partnerMedia?.audioStream, muteOthers]);

  const primaryLabel = showScreen ? "Partage d'écran" : "Votre caméra";

  return (
    <div className="calls-view__present">
      <article
        className={clsx(
          "call-present-tile",
          showCamera ? "call-present-tile--camera" : "call-present-tile--screen",
          speakingByParticipant.local && "call-present-tile--speaking",
        )}
      >
        {showScreen || showCamera ? (
          <video
            ref={primaryVideoRef}
            autoPlay
            muted
            playsInline
            className={
              showCamera
                ? "call-present-tile__media call-present-tile__media--cover"
                : "call-present-tile__media"
            }
          />
        ) : (
          <div className="call-present-tile__placeholder">
            {screenSharing ? (
              <MonitorUp size={32} className="text-muted-500" aria-hidden />
            ) : (
              <Video size={32} className="text-muted-500" aria-hidden />
            )}
          </div>
        )}
        <span className="call-present-tile__label">{primaryLabel}</span>
        {muted && <VoiceMuteBadge />}
      </article>

      <article
        className={clsx(
          "call-present-tile call-present-tile--participant",
          partner && speakingByParticipant[partner.id] && "call-present-tile--speaking",
        )}
      >
        {partner && (
          <audio ref={partnerAudioRef} autoPlay playsInline className="sr-only" aria-hidden />
        )}
        {partner ? (
          <>
            {showPartnerVideo ? (
              <video
                ref={partnerVideoRef}
                autoPlay
                muted
                playsInline
                className="call-present-tile__media call-present-tile__media--cover"
              />
            ) : (
              <div
                className="call-present-tile__avatar"
                style={{ backgroundColor: avatarColor(partner.id) }}
              >
                {userInitials(partner.name)}
              </div>
            )}
            <span className="call-present-tile__label">{partner.name}</span>
          </>
        ) : (
          <>
            <div className="call-present-tile__placeholder">
              <User size={32} className="text-muted-500" aria-hidden />
            </div>
            <span className="call-present-tile__label">Participant</span>
          </>
        )}
      </article>
    </div>
  );
}
