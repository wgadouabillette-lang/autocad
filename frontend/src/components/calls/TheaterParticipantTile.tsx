import clsx from "clsx";
import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type TheaterParticipant } from "../../lib/theater";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import UserAvatar from "../UserAvatar";
import ParticipantAvatarSignetHost from "./ParticipantAvatarSignetHost";

interface TheaterParticipantTileProps {
  participant: TheaterParticipant;
  workspaceId: string;
  large?: boolean;
  seat?: boolean;
  handRaised?: boolean;
  muted?: boolean;
  /** Callback exposé aux speakers : promouvoir la main levée en intervenant question. */
  onAcceptHandRaise?: () => void;
  /** Faux quand un autre invité est déjà sur scène pour une question. */
  canAcceptHandRaise?: boolean;
}

export default function TheaterParticipantTile({
  participant,
  workspaceId,
  large = false,
  seat = false,
  handRaised = false,
  muted = false,
  onAcceptHandRaise,
  canAcceptHandRaise = true,
}: TheaterParticipantTileProps) {
  const { t } = useTranslation();
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);
  const canMessage = !participant.isLocal;
  const canPromote = !!onAcceptHandRaise && handRaised && !participant.isLocal;
  const promoteDisabled = canPromote && !canAcceptHandRaise;
  const useAvatarAsButton = canMessage || canPromote;

  const handleAvatarClick = () => {
    if (canPromote) {
      if (!canAcceptHandRaise) return;
      onAcceptHandRaise?.();
      return;
    }
    if (canMessage) {
      openColleagueChat(workspaceId, participant.id, participant.name);
    }
  };

  const avatarAriaLabel = canPromote
    ? canAcceptHandRaise
      ? t("calls.goOnStageTitle")
      : t("calls.question")
    : canMessage
      ? t("calls.message", { name: participant.name })
      : participant.name;

  const avatar = (
    <UserAvatar
      userId={participant.id}
      name={participant.name}
      photoURL={participant.photoURL}
      isLocal={participant.isLocal}
      role={useAvatarAsButton ? "button" : undefined}
      tabIndex={useAvatarAsButton ? 0 : undefined}
      aria-disabled={promoteDisabled || undefined}
      aria-label={avatarAriaLabel}
      className={clsx(
        "theater-tile__avatar",
        canMessage && "theater-tile__avatar--message",
        canPromote && "theater-tile__avatar--promote",
        promoteDisabled && "theater-tile__avatar--promote-locked",
        handRaised && "theater-tile__avatar--hand",
        speakingByParticipant[participant.id] && "call-voice-speaking",
      )}
      onClick={useAvatarAsButton ? handleAvatarClick : undefined}
      onKeyDown={
        useAvatarAsButton
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              handleAvatarClick();
            }
          : undefined
      }
    />
  );

  const avatarExtras = handRaised ? (
    <span className="theater-tile__hand" title="Main levée" aria-hidden>
      ✋
    </span>
  ) : null;

  const showSignet = seat || canMessage;

  return (
    <article
      className={clsx(
        "theater-tile",
        large && "theater-tile--large",
        seat && "theater-tile--seat",
        participant.isLocal && "theater-tile--local",
        participant.role === "question" && "theater-tile--question",
        canPromote && "theater-tile--promotable",
        promoteDisabled && "theater-tile--promotable-locked",
      )}
    >
      {showSignet ? (
        <ParticipantAvatarSignetHost
          name={participant.name}
          className="theater-tile__avatar-wrap"
          placement={seat ? "above" : "below-avatar"}
        >
          {avatar}
          {avatarExtras}
        </ParticipantAvatarSignetHost>
      ) : (
        <span className="theater-tile__avatar-wrap">
          {avatar}
          {avatarExtras}
        </span>
      )}
      <div className="theater-tile__meta">
        <p className="theater-tile__name">{participant.name}</p>
        <p className="theater-tile__role">
          {participant.role === "speaker" && (
            <>
              <Mic size={11} aria-hidden />
              {t("calls.speaker")}
            </>
          )}
          {participant.role === "question" && (
            <>
              <Mic size={11} aria-hidden />
              {t("calls.question")}
            </>
          )}
          {participant.role === "audience" && (
            <>
              {muted ? <MicOff size={11} aria-hidden /> : <Mic size={11} aria-hidden />}
              {t("calls.audienceMember")}
            </>
          )}
        </p>
      </div>
    </article>
  );
}
