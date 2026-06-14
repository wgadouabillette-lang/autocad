import clsx from "clsx";
import { Mic } from "lucide-react";
import { type TheaterParticipant } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import UserAvatar from "../UserAvatar";

interface TheaterSpeakerCardProps {
  participant: TheaterParticipant;
  workspaceId: string;
}

export default function TheaterSpeakerCard({
  participant,
  workspaceId,
}: TheaterSpeakerCardProps) {
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const canMessage = !participant.isLocal;

  return (
    <article
      className={clsx(
        "theater-speaker-card",
        participant.isLocal && "theater-speaker-card--local",
        participant.role === "question" && "theater-speaker-card--question",
      )}
    >
      <UserAvatar
        userId={participant.id}
        name={participant.name}
        photoURL={participant.photoURL}
        isLocal={participant.isLocal}
        role={canMessage ? "button" : undefined}
        tabIndex={canMessage ? 0 : undefined}
        className={clsx(
          "theater-speaker-card__avatar",
          canMessage && "theater-speaker-card__avatar--message",
          speakingByParticipant[participant.id] && "call-voice-speaking",
        )}
        title={canMessage ? `Message à ${participant.name}` : participant.name}
        onClick={
          canMessage
            ? () => openColleagueChat(workspaceId, participant.id, participant.name)
            : undefined
        }
        onKeyDown={
          canMessage
            ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                openColleagueChat(workspaceId, participant.id, participant.name);
              }
            : undefined
        }
      />

      <div className="theater-speaker-card__footer">
        <p className="theater-speaker-card__name">{participant.name}</p>
        <p className="theater-speaker-card__role">
          <Mic size={11} aria-hidden />
          {participant.role === "question" ? "Question" : "Intervenant"}
        </p>
      </div>
    </article>
  );
}
