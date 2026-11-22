import clsx from "clsx";
import { Maximize2 } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { avatarTileTint, type CallUser } from "../../lib/calls";
import { usePersonLabel } from "../../lib/participantLabel";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import UserAvatar from "../UserAvatar";
import ParticipantVolumeControl from "./ParticipantVolumeControl";
import VoiceMuteBadge from "./VoiceMuteBadge";
import LocalScreenSharePreview from "./LocalScreenSharePreview";
import ScreenShareLiveBadge from "./ScreenShareLiveBadge";

interface VoiceParticipantTileProps {
  participant: CallUser;
  workspaceId: string;
  speaking?: boolean;
  videoStream?: MediaStream | null;
  audioStream?: MediaStream | null;
  audioMuted?: boolean;
  /** Désactive la vidéo (aperçus publics visibles par tout le groupe). */
  allowVideo?: boolean;
  compact?: boolean;
  fill?: boolean;
  shape?: "fill" | "wide" | "square";
  style?: CSSProperties;
  muted?: boolean;
  handRaised?: boolean;
  onActivate?: () => void;
  activateTitle?: string;
  showExpandHint?: boolean;
  strip?: boolean;
  stage?: boolean;
}

export default function VoiceParticipantTile({
  participant,
  workspaceId,
  speaking = false,
  videoStream = null,
  audioStream: _audioStream = null,
  audioMuted: _audioMuted = false,
  allowVideo = true,
  compact = false,
  fill = false,
  shape,
  style,
  muted,
  handRaised = false,
  onActivate,
  activateTitle,
  showExpandHint = false,
  strip = false,
  stage = false,
}: VoiceParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const localMuted = useCallsStore((s) => s.muted);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const { t } = useTranslation();
  const labelOf = usePersonLabel();
  const name = labelOf(participant.name, participant.isLocal);
  const canMessage = !participant.isLocal && !onActivate;
  const showVideo = allowVideo && !!videoStream;
  const showMuteBadge = muted ?? (participant.isLocal && localMuted);
  const interactive = canMessage || !!onActivate;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = showVideo ? videoStream : null;
  }, [showVideo, videoStream]);

  const showLocalScreen =
    participant.isLocal && screenSharing && !!screenShareStream && videoStream === screenShareStream;

  const body = (
    <>
      {showLocalScreen && screenShareStream ? (
        <LocalScreenSharePreview stream={screenShareStream} className="voice-participant-tile__media" />
      ) : showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="voice-participant-tile__media"
        />
      ) : (
        <div className="voice-participant-tile__avatar-stage" aria-hidden>
          <UserAvatar
            userId={participant.id}
            name={name}
            photoURL={participant.photoURL}
            isLocal={participant.isLocal}
            shape="circle"
            className="voice-participant-tile__avatar"
          />
        </div>
      )}
      <div className="voice-participant-tile__label">
        <span className="voice-participant-tile__name">{name}</span>
        {!participant.isLocal ? (
          <ParticipantVolumeControl uid={participant.id} name={name} />
        ) : null}
      </div>
      {showMuteBadge && <VoiceMuteBadge />}
      {showLocalScreen ? <ScreenShareLiveBadge /> : null}
      {handRaised && (
        <span className="voice-participant-tile__hand" title={t("calls.handRaised")} aria-hidden>
          ✋
        </span>
      )}
      {showExpandHint && showVideo && (
        <span className="voice-participant-tile__expand-hint" aria-hidden>
          <Maximize2 size={16} strokeWidth={2.25} />
        </span>
      )}
    </>
  );

  const className = clsx(
    "voice-participant-tile",
    compact && "voice-participant-tile--compact",
    strip && "voice-participant-tile--strip",
    stage && "voice-participant-tile--stage",
    fill && shape === "wide" && "voice-participant-tile--fill-wide",
    fill && shape === "square" && "voice-participant-tile--fill-square",
    fill && (!shape || shape === "fill") && "voice-participant-tile--fill",
    showVideo && "voice-participant-tile--media",
    showExpandHint && showVideo && "voice-participant-tile--expandable",
    speaking && "voice-participant-tile--speaking",
    canMessage && "voice-participant-tile--message",
  );

  const tileStyle = {
    ...style,
    "--voice-tile-tint": avatarTileTint(participant.id),
  } as CSSProperties;

  const handleActivate = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    if (onActivate) {
      onActivate();
      return;
    }
    openColleagueChat(workspaceId, participant.id, participant.name);
  };

  if (!interactive) {
    return (
      <article className={className} style={tileStyle}>
        {body}
      </article>
    );
  }

  return (
    <article
      role="button"
      tabIndex={0}
      className={className}
      style={tileStyle}
      title={
        activateTitle ??
        (onActivate ? undefined : t("calls.messageTo", { name }))
      }
      aria-label={
        activateTitle ??
        (onActivate ? undefined : t("calls.messageTo", { name }))
      }
      onClick={(event) => {
        if (event.currentTarget !== event.target) {
          const target = event.target as HTMLElement;
          if (target.closest("button, a, .participant-volume")) return;
        }
        handleActivate(event);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if ((event.target as HTMLElement).closest(".participant-volume")) return;
        event.preventDefault();
        handleActivate(event);
      }}
    >
      {body}
    </article>
  );
}
