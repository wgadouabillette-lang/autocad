import clsx from "clsx";
import { useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { resolveCallParticipantVideoDisplay } from "../../lib/callMediaFeeds";
import { type TheaterParticipant } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import UserAvatar from "../UserAvatar";
import ParticipantAvatarSignetHost from "./ParticipantAvatarSignetHost";
import VoiceMuteBadge from "./VoiceMuteBadge";

interface TheaterSpeakerCardProps {
  participant: TheaterParticipant;
  workspaceId: string;
  isOwner?: boolean;
}

export default function TheaterSpeakerCard({
  participant,
  workspaceId,
  isOwner = false,
}: TheaterSpeakerCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const localStream = useCallsStore((s) => s.localStream);
  const screenShareStream = useCallsStore((s) => s.screenShareStream);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const localMuted = useCallsStore((s) => s.muted);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const canMessage = !participant.isLocal;

  const openMessage = () => {
    openColleagueChat(workspaceId, participant.id, participant.name);
  };

  const remoteMedia = participant.isLocal ? undefined : remoteMediaByUid[participant.id];
  const { stream: videoStream, cover: videoCover } = resolveCallParticipantVideoDisplay({
    isLocal: !!participant.isLocal,
    cameraOn,
    screenSharing,
    localStream,
    screenShareStream,
    remoteMedia,
  });
  const showVideo = !!videoStream;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = showVideo ? videoStream : null;
  }, [showVideo, videoStream]);

  return (
    <article
      className={clsx(
        "theater-speaker-card",
        participant.isLocal && "theater-speaker-card--local",
        participant.role === "question" && "theater-speaker-card--question",
        showVideo && "theater-speaker-card--media",
        speakingByParticipant[participant.id] && "theater-speaker-card--speaking",
      )}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={clsx(
            "theater-speaker-card__media",
            videoCover && "theater-speaker-card__media--cover",
          )}
        />
      ) : canMessage ? (
        <ParticipantAvatarSignetHost name={participant.name}>
          <UserAvatar
            userId={participant.id}
            name={participant.name}
            photoURL={participant.photoURL}
            isLocal={participant.isLocal}
            role="button"
            tabIndex={0}
            className={clsx(
              "theater-speaker-card__avatar",
              "theater-speaker-card__avatar--message",
              speakingByParticipant[participant.id] && "call-voice-speaking",
            )}
            aria-label={`Message à ${participant.name}`}
            onClick={openMessage}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              openMessage();
            }}
          />
        </ParticipantAvatarSignetHost>
      ) : (
        <UserAvatar
          userId={participant.id}
          name={participant.name}
          photoURL={participant.photoURL}
          isLocal={participant.isLocal}
          className={clsx(
            "theater-speaker-card__avatar",
            speakingByParticipant[participant.id] && "call-voice-speaking",
          )}
          aria-label={participant.name}
        />
      )}

      <div className="theater-speaker-card__footer">
        <p className="theater-speaker-card__name">{participant.name}</p>
        <p className="theater-speaker-card__role">
          <Mic size={11} aria-hidden />
          {participant.role === "question"
            ? "Question"
            : isOwner
              ? "Propriétaire"
              : "Intervenant"}
        </p>
      </div>

      {participant.isLocal && localMuted ? <VoiceMuteBadge /> : null}
    </article>
  );
}
