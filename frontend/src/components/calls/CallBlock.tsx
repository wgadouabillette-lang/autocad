import clsx from "clsx";
import {
  blockHeaderTitle,
  blockActivityUser,
  findLocalBlock,
  isBlockInCall,
  type CallBlock as CallBlockType,
  type JoinRequest,
} from "../../lib/calls";
import { useUserAiStroke } from "../../hooks/useAiBlockStroke";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import { PRESENCE_OFFLINE_AFTER_MS, useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
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
  const isLocal = block.participants.some((p) => p.isLocal);
  const isMerged = block.participants.length > 1;
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
    const entry = s.membersByWorkspace[activeRoomId]?.[remoteUserId];
    if (!entry?.lastSeenMs) return true;
    return Date.now() - entry.lastSeenMs >= PRESENCE_OFFLINE_AFTER_MS;
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
