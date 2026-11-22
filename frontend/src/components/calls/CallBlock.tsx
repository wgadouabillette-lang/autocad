import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  blockHeaderTitle,
  blockActivityUser,
  findLocalBlock,
  isBlockInCall,
  isLocalPrivateCallHost,
  memberBlockId,
  type CallBlock as CallBlockType,
  type JoinRequest,
} from "../../lib/calls";
import { personLabel } from "../../lib/participantLabel";
import { UserMinus } from "lucide-react";
import { useUserAiStroke } from "../../hooks/useAiBlockStroke";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import CallBlockCard, { CALL_BLOCK_PRIVATE_AVATAR_SLOTS } from "./CallBlockCard";
import CallOccupancyHint from "./CallOccupancyHint";

interface CallBlockProps {
  block: CallBlockType;
  blocks: CallBlockType[];
  requests: JoinRequest[];
  onRequestJoin: (blockId: string) => void;
  layout?: "default" | "side";
}

export default function CallBlock({
  block,
  blocks,
  requests,
  onRequestJoin,
  layout = "default",
}: CallBlockProps) {
  const { t } = useTranslation();
  const userDisplayName = useStore((s) => s.userDisplayName);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const inCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const disconnectRemoteFromPrivateCall = useCallsStore((s) => s.disconnectRemoteFromPrivateCall);
  const isLocal = block.participants.some((p) => p.isLocal);
  const isMerged = block.participants.length > 1;
  const isPrivateCallHost =
    isLocal && isMerged && isLocalPrivateCallHost(blocks, activeRoomId) && block.id === memberBlockId(activeRoomId, "local");
  const remoteParticipants = block.participants.filter((participant) => !participant.isLocal);
  const inOpenChannelOnly = isLocal && inCall && !!localOpenChannelId;
  const blockActive = isLocal
    ? !inOpenChannelOnly
    : isBlockInCall(block, inCall);
  const localBlock = findLocalBlock(blocks);
  const incoming = requests.find(
    (r) => r.status === "pending" && r.toBlockId === block.id,
  );
  const outgoing = requests.find(
    (r) => r.status === "pending" && r.fromBlockId === block.id,
  );
  const remoteUserId = block.participants.find((p) => !p.isLocal)?.id ?? null;
  const remoteVoiceActive = useWorkspacePresenceStore((s) => {
    if (isLocal || !remoteUserId) return block.inCall === true;
    const voice = s.membersByWorkspace[activeRoomId]?.[remoteUserId]?.voice;
    return (
      block.inCall === true ||
      voice?.inPrivateCall === true ||
      voice?.inTheaterCall === true ||
      !!voice?.openChannelId
    );
  });
  const canRequestJoin =
    !isLocal &&
    !inCall &&
    !localOpenChannelId &&
    !isMerged &&
    block.participants.length === 1 &&
    localBlock?.participants.length === 1 &&
    !incoming &&
    !outgoing &&
    !requests.some(
      (r) =>
        r.status === "pending" &&
        (r.fromBlockId === localBlock?.id || r.toBlockId === localBlock?.id),
    );
  const isActionable = canRequestJoin;
  const rawTitle = blockHeaderTitle(block);
  const title = personLabel(
    rawTitle,
    block.participants.some((participant) => participant.isLocal && participant.name === rawTitle),
    userDisplayName,
    t,
  );
  const { userId: activityUserId, isLocal: activityIsLocal } = blockActivityUser(block);
  const aiStrokeRaw = useUserAiStroke(activeRoomId, activityUserId, activityIsLocal);
  const aiStroke = isLocal && inOpenChannelOnly ? null : aiStrokeRaw;

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--private",
        layout === "side" && "call-block--side",
        isLocal && blockActive && "call-block--local",
        isLocal && !blockActive && "call-block--idle",
        !isLocal && !remoteVoiceActive && "call-block--connected",
        !isLocal && remoteVoiceActive && "call-block--local",
        isMerged && "call-block--merged",
        isActionable && "call-block--clickable",
        (incoming || outgoing) && "call-block--pending",
      )}
      title={title}
      participants={block.participants}
      participantLayout="avatars"
      fixedAvatarSlots={CALL_BLOCK_PRIVATE_AVATAR_SLOTS}
      activityUserId={activityUserId}
      activityIsLocal={activityIsLocal}
      showActivity={false}
      aiStroke={aiStroke}
      trailing={
        <>
          <CallOccupancyHint participants={block.participants} mediaOnly />
          {isPrivateCallHost
            ? remoteParticipants.map((participant) => (
                <button
                  key={participant.id}
                  type="button"
                  className="call-block__kick"
                  onClick={(event) => {
                    event.stopPropagation();
                    disconnectRemoteFromPrivateCall(activeRoomId, participant.id);
                  }}
                  aria-label={t("calls.disconnect", {
                    name: personLabel(participant.name, participant.isLocal, userDisplayName, t),
                  })}
                  title={t("calls.disconnect", {
                    name: personLabel(participant.name, participant.isLocal, userDisplayName, t),
                  })}
                >
                  <UserMinus size={12} strokeWidth={2.25} aria-hidden />
                </button>
              ))
            : null}
        </>
      }
      mainDisabled={!isActionable}
      onMainClick={canRequestJoin ? () => onRequestJoin(block.id) : undefined}
      mainAriaLabel={canRequestJoin ? t("calls.askToJoin", { name: title }) : title}
    />
  );
}
