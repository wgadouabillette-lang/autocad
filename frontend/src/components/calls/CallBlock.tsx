import clsx from "clsx";
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
import { UserMinus } from "lucide-react";
import { useUserAiStroke } from "../../hooks/useAiBlockStroke";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import CallBlockCard from "./CallBlockCard";

interface CallBlockProps {
  index?: number;
  block: CallBlockType;
  blocks: CallBlockType[];
  requests: JoinRequest[];
  onRequestJoin: (blockId: string) => void;
  layout?: "default" | "side";
}

export default function CallBlock({
  index = 0,
  block,
  blocks,
  requests,
  onRequestJoin,
  layout = "default",
}: CallBlockProps) {
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
  const isOffline = useWorkspacePresenceStore((s) => {
    if (isLocal || !remoteUserId || !s.loadedByWorkspace[activeRoomId]) return false;
    void s.presenceTick;
    return !s.isOnline(activeRoomId, remoteUserId);
  });
  const remoteInPrivateCall = useWorkspacePresenceStore((s) => {
    if (isLocal || !remoteUserId) return false;
    const inPrivateCall =
      s.membersByWorkspace[activeRoomId]?.[remoteUserId]?.voice.inPrivateCall === true;
    return block.inCall === true || inPrivateCall;
  });
  const canRequestJoin =
    !isLocal &&
    !inCall &&
    !localOpenChannelId &&
    !isOffline &&
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
  const { userId: activityUserId, isLocal: activityIsLocal } = blockActivityUser(block);
  const aiStrokeRaw = useUserAiStroke(activeRoomId, activityUserId, activityIsLocal);
  const aiStroke = isLocal && inOpenChannelOnly ? null : isOffline ? null : aiStrokeRaw;

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--cascade",
        layout === "side" && "call-block--side",
        isLocal && blockActive && "call-block--local",
        isLocal && !blockActive && "call-block--idle",
        !isLocal && !blockActive && !isOffline && !remoteInPrivateCall && "call-block--connected",
        !isLocal && remoteInPrivateCall && !blockActive && "call-block--local",
        !isLocal && isOffline && "call-block--offline",
        isMerged && "call-block--merged",
        isActionable && !isOffline && "call-block--clickable",
        (incoming || outgoing) && "call-block--pending",
      )}
      style={{ animationDelay: `${index * 20}ms` }}
      title={blockHeaderTitle(block)}
      participants={block.participants}
      activityUserId={activityUserId}
      activityIsLocal={activityIsLocal}
      aiStroke={aiStroke}
      standby={isOffline}
      trailing={
        isPrivateCallHost ? (
          <>
            {remoteParticipants.map((participant) => (
              <button
                key={participant.id}
                type="button"
                className="call-block__kick"
                onClick={(event) => {
                  event.stopPropagation();
                  disconnectRemoteFromPrivateCall(activeRoomId, participant.id);
                }}
                aria-label={`Déconnecter ${participant.name}`}
                title={`Déconnecter ${participant.name}`}
              >
                <UserMinus size={12} strokeWidth={2.25} aria-hidden />
              </button>
            ))}
          </>
        ) : undefined
      }
      mainDisabled={!isActionable}
      onMainClick={canRequestJoin ? () => onRequestJoin(block.id) : undefined}
      mainAriaLabel={
        isOffline
          ? `${blockHeaderTitle(block)} — hors ligne`
          : canRequestJoin
            ? `Demander à rejoindre ${blockHeaderTitle(block)}`
            : blockHeaderTitle(block)
      }
    />
  );
}
