import clsx from "clsx";
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
}

export default function VoiceParticipantTile({
  participant,
  workspaceId,
  speaking = false,
  videoStream = null,
  audioStream = null,
  audioMuted = false,
  allowVideo = true,
  compact = false,
  fill = false,
  shape,
  style,
  muted,
  handRaised = false,
}: VoiceParticipantTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const localMuted = useCallsStore((s) => s.muted);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const canMessage = !participant.isLocal;
  const showVideo = allowVideo && !!videoStream;
  const showMuteBadge = muted ?? (participant.isLocal && localMuted);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = showVideo ? videoStream : null;
  }, [showVideo, videoStream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || participant.isLocal) return;
    audio.srcObject = audioStream;
    audio.muted = audioMuted;
  }, [audioStream, audioMuted, participant.isLocal]);

  const body = (
    <>
      {!participant.isLocal && (
        <audio ref={audioRef} autoPlay playsInline className="sr-only" aria-hidden />
      )}
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
    </>
  );

  const className = clsx(
    "voice-participant-tile",
    compact && "voice-participant-tile--compact",
    fill && shape === "wide" && "voice-participant-tile--fill-wide",
    fill && shape === "square" && "voice-participant-tile--fill-square",
    fill && (!shape || shape === "fill") && "voice-participant-tile--fill",
    speaking && "voice-participant-tile--speaking",
    canMessage && "voice-participant-tile--message",
  );

  const tileStyle = {
    ...style,
    "--voice-tile-tint": avatarTileTint(participant.id),
  } as CSSProperties;

  if (!canMessage) {
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
      title={`Message à ${participant.name}`}
      onClick={(event) => {
        event.stopPropagation();
        openColleagueChat(workspaceId, participant.id, participant.name);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        openColleagueChat(workspaceId, participant.id, participant.name);
      }}
    >
      {body}
    </article>
  );
}
