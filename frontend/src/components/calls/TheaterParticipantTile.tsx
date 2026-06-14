import clsx from "clsx";
import { Mic, MicOff } from "lucide-react";
import { type TheaterParticipant } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import UserAvatar from "../UserAvatar";

interface TheaterParticipantTileProps {
  participant: TheaterParticipant;
  workspaceId: string;
  large?: boolean;
  handRaised?: boolean;
  muted?: boolean;
}

export default function TheaterParticipantTile({
  participant,
  workspaceId,
  large = false,
  handRaised = false,
  muted = false,
}: TheaterParticipantTileProps) {
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const canMessage = !participant.isLocal;

  return (
    <article
      className={clsx(
        "theater-tile",
        large && "theater-tile--large",
        participant.isLocal && "theater-tile--local",
        participant.role === "question" && "theater-tile--question",
        handRaised && "theater-tile--hand-raised",
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
          "theater-tile__avatar",
          canMessage && "theater-tile__avatar--message",
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
      <div className="theater-tile__meta">
        <p className="theater-tile__name">{participant.name}</p>
        <p className="theater-tile__role">
          {participant.role === "speaker" && (
            <>
              <Mic size={11} aria-hidden />
              Intervenant
            </>
          )}
          {participant.role === "question" && (
            <>
              <Mic size={11} aria-hidden />
              Question
            </>
          )}
          {participant.role === "audience" && (
            <>
              {muted ? <MicOff size={11} aria-hidden /> : <Mic size={11} aria-hidden />}
              Spectateur
            </>
          )}
        </p>
      </div>
      {handRaised && (
        <span className="theater-tile__hand" title="Main levée" aria-hidden>
          <span className="join-knock__hand theater-tile__hand-glyph" />
        </span>
      )}
    </article>
  );
}
