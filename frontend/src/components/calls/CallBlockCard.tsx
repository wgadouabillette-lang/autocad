import clsx from "clsx";
import type { ReactNode } from "react";
import { aiStrokeClasses, type AiStrokeVariant } from "../../lib/aiModelStroke";
import {
  participantHasHandRaised,
  type CallUser,
} from "../../lib/calls";
import { useCallsStore } from "../../store/useCallsStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import { useStore } from "../../store/useStore";
import UserAvatar from "../UserAvatar";
import PresenceActivityButton from "./PresenceActivityButton";
import VoiceParticipantTile from "./VoiceParticipantTile";

export const CALL_BLOCK_AVATAR_SLOTS = 4;
export const CALL_BLOCK_TILE_SLOTS = 2;

interface CallBlockCardProps {
  title: string;
  titleContent?: ReactNode;
  participants: CallUser[];
  activityUserId?: string;
  activityIsLocal?: boolean;
  showActivity?: boolean;
  trailing?: ReactNode;
  belowHeader?: ReactNode;
  onMainClick?: () => void;
  mainDisabled?: boolean;
  mainAriaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  aiStroke?: AiStrokeVariant | null;
  participantLayout?: "avatars" | "tiles" | "theater";
  audienceParticipants?: CallUser[];
  showHandRaise?: boolean;
  standby?: boolean;
}

export default function CallBlockCard({
  title,
  titleContent,
  participants,
  activityUserId = "local",
  activityIsLocal = false,
  showActivity = true,
  trailing,
  belowHeader,
  onMainClick,
  mainDisabled = false,
  mainAriaLabel,
  className,
  style,
  aiStroke = null,
  participantLayout = "avatars",
  audienceParticipants = [],
  showHandRaise = false,
  standby = false,
}: CallBlockCardProps) {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const handRaises = useCallsStore((s) => s.callsByRoom[activeRoomId]?.handRaises ?? []);
  const openColleagueChat = useMiniChatStore((s) => s.openForColleague);

  const previewTiles = participants.slice(0, CALL_BLOCK_TILE_SLOTS);
  const avatarSlots = Array.from(
    { length: CALL_BLOCK_AVATAR_SLOTS },
    (_, index) => participants[index] ?? null,
  );
  const audienceSlots = Array.from(
    { length: CALL_BLOCK_AVATAR_SLOTS },
    (_, index) => audienceParticipants[index] ?? null,
  );
  const blockClassName = clsx(className, ...aiStrokeClasses(aiStroke));

  const renderAvatar = (user: CallUser) => (
    <UserAvatar
      key={user.id}
      userId={user.id}
      name={user.name}
      photoURL={user.photoURL}
      isLocal={user.isLocal}
      className={clsx(
        "call-block__avatar",
        !user.isLocal && "call-block__avatar--message",
        speakingByParticipant[user.id] && "call-voice-speaking",
      )}
      {...(!user.isLocal
        ? {
            role: "button" as const,
            tabIndex: 0,
            title: `Message à ${user.name}`,
            onClick: (event: React.MouseEvent) => {
              event.stopPropagation();
              openColleagueChat(activeRoomId, user.id, user.name);
            },
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.stopPropagation();
              event.preventDefault();
              openColleagueChat(activeRoomId, user.id, user.name);
            },
          }
        : { title: user.name })}
    />
  );

  const renderPreviewTile = (user: CallUser) => (
    <VoiceParticipantTile
      key={user.id}
      participant={user}
      workspaceId={activeRoomId}
      speaking={speakingByParticipant[user.id] ?? false}
      handRaised={showHandRaise && participantHasHandRaised(handRaises, user.id)}
      allowVideo={false}
      compact
    />
  );

  const body = (
    <div className="call-block__surface">
      <div className="call-block__row call-block__row--header">
        {titleContent ?? <p className="call-block__title">{title}</p>}
        <div className="call-block__header-trailing">
          {showActivity && !standby && (
            <PresenceActivityButton
              roomId={activeRoomId}
              userId={activityUserId}
              isLocal={activityIsLocal}
            />
          )}
          {standby && (
            <span className="call-block__standby-badge" aria-label="Hors ligne">
              Hors ligne
            </span>
          )}
          {trailing}
        </div>
      </div>

      {belowHeader}

      {participantLayout === "theater" ? (
        <div className="call-block__row call-block__row--theater" aria-label="Participants">
          {previewTiles.length > 0 && (
            <div
              className="call-block__row call-block__row--participant-tiles"
              aria-label="Intervenants"
            >
              {previewTiles.map(renderPreviewTile)}
            </div>
          )}
          <div className="call-block__row call-block__row--avatars" aria-label="Spectateurs">
            {audienceSlots.map((user, index) =>
              user ? (
                renderAvatar(user)
              ) : (
                <span
                  key={`audience-slot-${index}`}
                  className="call-block__avatar call-block__avatar--slot"
                  aria-hidden
                />
              ),
            )}
          </div>
        </div>
      ) : (
        <div
          className={clsx(
            "call-block__row",
            participantLayout === "tiles"
              ? "call-block__row--participant-tiles"
              : "call-block__row--avatars",
          )}
          aria-label="Participants"
        >
          {participantLayout === "tiles"
            ? previewTiles.map(renderPreviewTile)
            : avatarSlots.map((user, index) =>
                user ? (
                  renderAvatar(user)
                ) : (
                  <span
                    key={`slot-${index}`}
                    className="call-block__avatar call-block__avatar--slot"
                    aria-hidden
                  />
                ),
              )}
        </div>
      )}
    </div>
  );

  if (!onMainClick) {
    return (
      <article className={blockClassName} style={style}>
        {standby && <span className="call-block__standby-veil" aria-hidden />}
        <div className="call-block__main">{body}</div>
      </article>
    );
  }

  return (
    <article className={blockClassName} style={style}>
      {standby && <span className="call-block__standby-veil" aria-hidden />}
      <button
        type="button"
        className="call-block__main"
        disabled={mainDisabled}
        onClick={onMainClick}
        aria-label={mainAriaLabel ?? title}
      >
        {body}
      </button>
    </article>
  );
}
