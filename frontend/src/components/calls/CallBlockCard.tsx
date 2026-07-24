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
import PresenceActivityButton, { CallBlockMediaStatusIcons } from "./PresenceActivityButton";
import VoiceParticipantTile from "./VoiceParticipantTile";

export const CALL_BLOCK_AVATAR_SLOTS = 5;
export const CALL_BLOCK_PRIVATE_AVATAR_SLOTS = 2;
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
  /** Remplace la section participants (ex. mini-preview Théâtre). */
  body?: ReactNode;
  onMainClick?: () => void;
  mainDisabled?: boolean;
  mainAriaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  aiStroke?: AiStrokeVariant | null;
  participantLayout?: "avatars" | "tiles" | "theater";
  /** Si défini, affiche toujours N cercles (vides ou avec pfp), max N participants. */
  fixedAvatarSlots?: number;
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
  body,
  onMainClick,
  mainDisabled = false,
  mainAriaLabel,
  className,
  style,
  aiStroke = null,
  participantLayout = "avatars",
  fixedAvatarSlots,
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
  const avatarSlotCount = fixedAvatarSlots && fixedAvatarSlots > 0 ? fixedAvatarSlots : 0;
  const avatarParticipants = participants.slice(
    0,
    avatarSlotCount > 0 ? avatarSlotCount : CALL_BLOCK_AVATAR_SLOTS,
  );
  const audiencePreview = audienceParticipants.slice(0, CALL_BLOCK_AVATAR_SLOTS);
  const blockClassName = clsx("forma-capsule", className, ...aiStrokeClasses(aiStroke));

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

  const renderAvatarRow = (users: CallUser[], fixedSlots?: number) => {
    if (!fixedSlots) {
      return users.map((user) => renderAvatar(user));
    }
    return Array.from({ length: fixedSlots }, (_, index) => {
      const user = users[index];
      if (user) return renderAvatar(user);
      return (
        <span
          key={`empty-avatar-${index}`}
          className="call-block__avatar call-block__avatar--empty"
          aria-hidden
        />
      );
    });
  };

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
            : clsx(
                "call-block__row--avatars",
                avatarSlotCount > 0 && "call-block__row--avatars-fixed",
              ),
        )}
        aria-label="Participants"
      >
        {participantLayout === "tiles"
          ? previewTiles.map(renderPreviewTile)
          : renderAvatarRow(avatarParticipants, avatarSlotCount || undefined)}
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
      <div className="call-block__clip">
        {standby && <span className="call-block__standby-veil" aria-hidden />}
        {showActivity && !standby && (
          <div className="call-block__activity-overlay" data-call-block-action="">
            <PresenceActivityButton
              roomId={activeRoomId}
              userId={activityUserId}
              isLocal={activityIsLocal}
              layout="corner"
            />
          </div>
        )}
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
              {trailing || (showActivity && !standby && activityIsLocal) ? (
                <div className="call-block__header-trailing" data-call-block-action="">
                  {showActivity && !standby && activityIsLocal && (
                    <CallBlockMediaStatusIcons userId={activityUserId} isLocal />
                  )}
                  {trailing}
                </div>
              ) : null}
            </div>

            {belowHeader}

            {body ?? participantSection}
          </div>
        </div>
      </div>
    </article>
  );
}
