import clsx from "clsx";
import { UserMinus } from "lucide-react";
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
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";
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
  const canManageWorkspace = useWorkspacesStore((s) => s.isWorkspaceOwner(activeRoomId));
  const kickMember = useCallsStore((s) => s.kickMember);
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
  const presenceLoaded = useWorkspacePresenceStore((s) => s.isLoaded(activeRoomId));
  const presenceTick = useWorkspacePresenceStore((s) => s.presenceTick);
  const isMemberOnline = useWorkspacePresenceStore((s) => s.isOnline);
  const isOffline =
    !isLocal &&
    !!remoteUserId &&
    presenceLoaded &&
    !isMemberOnline(activeRoomId, remoteUserId);
  void presenceTick;
  const canRequestJoin =
    !isLocal &&
    !isOffline &&
    blockActive &&
    !isMerged &&
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
  const canKick = canManageWorkspace && !isLocal;

  return (
    <CallBlockCard
      className={clsx(
        "call-block",
        "call-block--cascade",
        layout === "side" && "call-block--side",
        isLocal && blockActive && "call-block--local",
        isLocal && !blockActive && "call-block--idle",
        !isLocal && !blockActive && !isOffline && "call-block--connected",
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
      onMainClick={
        canRequestJoin ? () => onRequestJoin(block.id) : undefined
      }
      mainAriaLabel={
        isOffline
          ? `${blockHeaderTitle(block)} — hors ligne`
          : canRequestJoin
            ? `Demander à rejoindre ${blockHeaderTitle(block)}`
            : blockHeaderTitle(block)
      }
      trailing={
        canKick ? (
          <button
            type="button"
            className="call-block__kick"
            onClick={(event) => {
              event.stopPropagation();
              kickMember(activeRoomId, block.id);
            }}
            aria-label={`Expulser ${blockHeaderTitle(block)}`}
            title="Expulser du workspace"
          >
            <UserMinus size={12} strokeWidth={2.25} aria-hidden />
          </button>
        ) : undefined
      }
    />
  );
}
