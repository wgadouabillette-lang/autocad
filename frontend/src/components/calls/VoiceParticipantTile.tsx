import clsx from "clsx";
import { Maximize2 } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";
import { avatarTileTint, type CallUser } from "../../lib/calls";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import UserAvatar from "../UserAvatar";
import VoiceMuteBadge from "./VoiceMuteBadge";

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
  const localMuted = useCallsStore((s) => s.muted);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const canMessage = !participant.isLocal && !onActivate;
  const showVideo = allowVideo && !!videoStream;
  const showMuteBadge = muted ?? (participant.isLocal && localMuted);
  const interactive = canMessage || !!onActivate;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = showVideo ? videoStream : null;
  }, [showVideo, videoStream]);

  const body = (
    <>
      {showVideo ? (
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
            name={participant.name}
            photoURL={participant.photoURL}
            isLocal={participant.isLocal}
            shape="circle"
            className="voice-participant-tile__avatar"
          />
        </div>
      )}
      <span className="voice-participant-tile__label">{participant.name}</span>
      {showMuteBadge && <VoiceMuteBadge />}
      {handRaised && (
        <span className="voice-participant-tile__hand" title="Main levée" aria-hidden>
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
        (onActivate ? undefined : `Message à ${participant.name}`)
      }
      aria-label={
        activateTitle ??
        (onActivate ? undefined : `Message à ${participant.name}`)
      }
      onClick={(event) => {
        if (event.currentTarget !== event.target) {
          const target = event.target as HTMLElement;
          if (target.closest("button, a")) return;
        }
        handleActivate(event);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleActivate(event);
      }}
    >
      {body}
    </article>
  );
}
