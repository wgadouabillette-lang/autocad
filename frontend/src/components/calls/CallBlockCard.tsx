import clsx from "clsx";
import type { ReactNode } from "react";
import { aiStrokeClasses, type AiStrokeVariant } from "../../lib/aiModelStroke";
import {
  participantHasHandRaised,
  type CallUser,
} from "../../lib/calls";
import { useAuthStore } from "../../store/useAuthStore";
import { useCallsStore } from "../../store/useCallsStore";
import { usePeopleStore } from "../../store/usePeopleStore";
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
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const speakingByParticipant = useCallsStore((s) => s.speakingByParticipant);
  const mutedByParticipant = useCallsStore((s) => s.mutedByParticipant);
  const handRaises = useCallsStore((s) => s.callsByRoom[activeRoomId]?.handRaises ?? []);
  const openMemberConversation = usePeopleStore((s) => s.openWorkspaceMemberConversation);

  const canMessageParticipant = (user: CallUser) => {
    if (user.isLocal || user.id === "local") return false;
    if (firebaseUid && user.id === firebaseUid) return false;
    return true;
  };

  const previewTiles = participants.slice(0, CALL_BLOCK_TILE_SLOTS);
  const avatarParticipants = participants.slice(0, CALL_BLOCK_AVATAR_SLOTS);
  const audiencePreview = audienceParticipants.slice(0, CALL_BLOCK_AVATAR_SLOTS);
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
        canMessageParticipant(user) && "call-block__avatar--message",
        speakingByParticipant[user.id] && "call-voice-speaking",
      )}
      {...(canMessageParticipant(user)
        ? {
            role: "button" as const,
            tabIndex: 0,
            title: `Message à ${user.name}`,
            onClick: (event: React.MouseEvent) => {
              event.stopPropagation();
              openMemberConversation(activeRoomId, user.id, user.name);
            },
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.stopPropagation();
              event.preventDefault();
              openMemberConversation(activeRoomId, user.id, user.name);
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
      muted={user.isLocal ? undefined : mutedByParticipant[user.id] === true}
      allowVideo={false}
      compact
    />
  );

  const participantSection =
    participantLayout === "theater" ? (
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
          {audiencePreview.map((user) => renderAvatar(user))}
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
          : avatarParticipants.map((user) => renderAvatar(user))}
      </div>
    );

  const mainClickEnabled = !!onMainClick && !mainDisabled;

  const handleMainClick = (event: React.MouseEvent) => {
    if (!mainClickEnabled || !onMainClick) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, [data-call-block-action]")) return;
    onMainClick();
  };

  const handleMainKeyDown = (event: React.KeyboardEvent) => {
    if (!mainClickEnabled || !onMainClick) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onMainClick();
  };

  return (
    <article className={blockClassName} style={style}>
      {standby && <span className="call-block__standby-veil" aria-hidden />}
      <div
        className={clsx(
          "call-block__main",
          onMainClick && mainDisabled && "call-block__main--disabled",
        )}
        role={onMainClick ? "button" : undefined}
        tabIndex={mainClickEnabled ? 0 : onMainClick ? -1 : undefined}
        aria-disabled={onMainClick && mainDisabled ? true : undefined}
        aria-label={onMainClick ? mainAriaLabel ?? title : undefined}
        onClick={onMainClick ? handleMainClick : undefined}
        onKeyDown={onMainClick ? handleMainKeyDown : undefined}
      >
        <div className="call-block__surface">
          <div className="call-block__row call-block__row--header">
            {titleContent ?? <p className="call-block__title">{title}</p>}
            <div className="call-block__header-trailing" data-call-block-action="">
              {showActivity && !standby && (
                <PresenceActivityButton
                  roomId={activeRoomId}
                  userId={activityUserId}
                  isLocal={activityIsLocal}
                />
              )}
              {trailing}
            </div>
          </div>

          {belowHeader}

          {participantSection}
        </div>
      </div>
    </article>
  );
}
