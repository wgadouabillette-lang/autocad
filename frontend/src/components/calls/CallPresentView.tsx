import clsx from "clsx";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { MonitorUp, User, UserMinus, Video } from "lucide-react";
import {
  activeCallPartner,
  avatarColor,
  findLocalBlock,
  isLocalPrivateCallHost,
  userInitials,
  type CallBlock,
} from "../../lib/calls";
import { usePersonLabel } from "../../lib/participantLabel";
import { participantVideoStream } from "../../lib/webrtc/workspaceVoiceRtc";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import ParticipantVolumeControl from "./ParticipantVolumeControl";
import VoiceMuteBadge from "./VoiceMuteBadge";
import LocalScreenSharePreview from "./LocalScreenSharePreview";
import ScreenShareLiveBadge from "./ScreenShareLiveBadge";

interface CallPresentViewProps {
  blocks: CallBlock[];
}

export default function CallPresentView({ blocks }: CallPresentViewProps) {
  const { t } = useTranslation();
  const labelOf = usePersonLabel();
  const activeRoomId = useStore((s) => s.activeRoomId);
  const disconnectRemoteFromPrivateCall = useCallsStore((s) => s.disconnectRemoteFromPrivateCall);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const localStream = useCallsStore((s) => s.localStream);
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const muted = useCallsStore((s) => s.muted);
  const mutedByParticipant = useCallsStore((s) => s.mutedByParticipant);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);

  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const partnerVideoRef = useRef<HTMLVideoElement>(null);

  const localBlock = findLocalBlock(blocks);
  const partner = activeCallPartner(blocks, localBlock);
  const canDisconnectPartner =
    !!partner && isLocalPrivateCallHost(blocks, activeRoomId);

  const showScreen = screenSharing && screenShareStream;
  const showCamera = !showScreen && cameraOn && localStream;
  const partnerMedia = partner ? remoteMediaByUid[partner.id] : undefined;
  const partnerVideoStream = participantVideoStream(partnerMedia);
  const showPartnerVideo = !!partnerVideoStream;

  useEffect(() => {
    const video = primaryVideoRef.current;
    if (!video) return;
    if (showCamera) {
      video.srcObject = localStream;
      return;
    }
    video.srcObject = null;
  }, [showCamera, localStream]);

  useEffect(() => {
    const video = partnerVideoRef.current;
    if (!video) return;
    video.srcObject = showPartnerVideo ? partnerVideoStream : null;
  }, [showPartnerVideo, partnerVideoStream]);

  const primaryLabel = showScreen ? t("calls.screenShareTile") : t("calls.yourCamera");
  const partnerName = partner ? labelOf(partner.name, partner.isLocal) : "";

  return (
    <div className="calls-view__present">
      <article
        className={clsx(
          "call-present-tile",
          showCamera ? "call-present-tile--camera" : "call-present-tile--screen",
          speakingByParticipant.local && "call-present-tile--speaking",
        )}
      >
        {showScreen && screenShareStream ? (
          <LocalScreenSharePreview
            stream={screenShareStream}
            className="call-present-tile__media"
          />
        ) : showCamera ? (
          <video
            ref={primaryVideoRef}
            autoPlay
            muted
            playsInline
            className="call-present-tile__media"
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
        {showScreen ? <ScreenShareLiveBadge /> : null}
      </article>

      <article
        className={clsx(
          "call-present-tile call-present-tile--participant",
          partner && speakingByParticipant[partner.id] && "call-present-tile--speaking",
        )}
      >
        {partner ? (
          <>
            {showPartnerVideo ? (
              <video
                ref={partnerVideoRef}
                autoPlay
                muted
                playsInline
                className="call-present-tile__media"
              />
            ) : (
              <div
                className="call-present-tile__avatar"
                style={{ backgroundColor: avatarColor(partner.id) }}
              >
                {userInitials(partnerName)}
              </div>
            )}
            <div className="call-present-tile__label">
              <span className="call-present-tile__name">{partnerName}</span>
              <ParticipantVolumeControl uid={partner.id} name={partnerName} />
            </div>
            {partner && mutedByParticipant[partner.id] ? <VoiceMuteBadge /> : null}
            {canDisconnectPartner ? (
              <button
                type="button"
                className="call-present-tile__disconnect"
                onClick={() => disconnectRemoteFromPrivateCall(activeRoomId, partner.id)}
                aria-label={t("calls.disconnect", { name: partnerName })}
                title={t("calls.disconnect", { name: partnerName })}
              >
                <UserMinus size={14} strokeWidth={2.25} aria-hidden />
              </button>
            ) : null}
          </>
        ) : (
          <>
            <div className="call-present-tile__placeholder">
              <User size={32} className="text-muted-500" aria-hidden />
            </div>
            <span className="call-present-tile__label">{t("calls.participant")}</span>
          </>
        )}
      </article>
    </div>
  );
}
