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

  const primaryVideoRef = useRef<HTMLVideoElement>(null);

  const localBlock = findLocalBlock(blocks);
  const partner = activeCallPartner(blocks, localBlock);

  const showScreen = screenSharing && screenShareStream;
  const showCamera = !showScreen && cameraOn && localStream;

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
        {partner ? (
          <>
            <div
              className="call-present-tile__avatar"
              style={{ backgroundColor: avatarColor(partner.id) }}
            >
              {userInitials(partner.name)}
            </div>
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
