import { findLocalBlock, type RoomCallsState } from "../calls";

export interface VoiceRtcContext {
  workspaceId: string;
  sessionId: string;
  peerUids: string[];
}

function uniquePeerUids(ids: string[], localFirebaseUid: string): string[] {
  return [...new Set(ids.filter((id) => id && id !== "local" && id !== localFirebaseUid))];
}

/** Détermine la session WebRTC active et les pairs à connecter. */
export function resolveVoiceRtcContext(input: {
  workspaceId: string;
  roomCalls: RoomCallsState | undefined;
  localInCall: boolean;
  localOpenChannelId: string | null;
  localFirebaseUid: string | null;
}): VoiceRtcContext | null {
  const { workspaceId, roomCalls, localInCall, localOpenChannelId, localFirebaseUid } = input;
  if (!localInCall || !localFirebaseUid || !workspaceId) return null;

  if (localOpenChannelId && roomCalls) {
    const channel = roomCalls.openChannels.find((entry) => entry.id === localOpenChannelId);
    if (!channel) return null;
    const peerUids = uniquePeerUids(
      channel.participants.map((participant) => participant.id),
      localFirebaseUid,
    );
    return {
      workspaceId,
      sessionId: `open__${localOpenChannelId}`,
      peerUids,
    };
  }

  if (!roomCalls) return null;
  const localBlock = findLocalBlock(roomCalls.blocks);
  if (!localBlock?.inCall) return null;

  if (localBlock.participants.length > 1) {
    const peerUids = uniquePeerUids(
      localBlock.participants.map((participant) => participant.id),
      localFirebaseUid,
    );
    const sessionUids = [localFirebaseUid, ...peerUids].sort();
    return {
      workspaceId,
      sessionId: `block__${sessionUids.join("_")}`,
      peerUids,
    };
  }

  const remoteInCall = roomCalls.blocks
    .filter(
      (block) =>
        block.participants.length === 1 &&
        !block.participants[0]?.isLocal &&
        block.inCall,
    )
    .map((block) => block.participants[0]?.id ?? "")
    .filter(Boolean);

  const peerUids = uniquePeerUids(remoteInCall, localFirebaseUid);
  if (peerUids.length === 0) return null;

  const sessionUids = [localFirebaseUid, ...peerUids].sort();
  return {
    workspaceId,
    sessionId: `private__${sessionUids.join("_")}`,
    peerUids,
  };
}
