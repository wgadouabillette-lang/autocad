import { findLocalBlock, type RoomCallsState } from "../calls";

export interface VoiceRtcContext {
  workspaceId: string;
  sessionId: string;
  peerUids: string[];
}

function uniquePeerUids(ids: string[], localFirebaseUid: string): string[] {
  return [...new Set(ids.filter((id) => id && id !== "local" && id !== localFirebaseUid))];
}

export interface PresenceVoiceSnapshot {
  inPrivateCall: boolean;
  openChannelId: string | null;
  inTheaterCall?: boolean;
}

function sessionIdForPeers(
  prefix: "block" | "private",
  localFirebaseUid: string,
  peerUids: string[],
): string {
  return `${prefix}__${[localFirebaseUid, ...peerUids].sort().join("_")}`;
}

function theaterPeerUids(
  presenceMembers: Record<string, { voice: PresenceVoiceSnapshot }> | undefined,
  localFirebaseUid: string,
): string[] {
  if (!presenceMembers) return [];
  const peers: string[] = [];
  for (const [uid, entry] of Object.entries(presenceMembers)) {
    if (!uid || uid === "local" || uid === localFirebaseUid) continue;
    if (entry.voice.inTheaterCall) peers.push(uid);
  }
  return peers;
}

function presencePeerUids(
  presenceMembers: Record<string, { voice: PresenceVoiceSnapshot }> | undefined,
  localFirebaseUid: string,
  localOpenChannelId: string | null,
): string[] {
  if (!presenceMembers) return [];
  const peers: string[] = [];
  for (const [uid, entry] of Object.entries(presenceMembers)) {
    if (!uid || uid === "local" || uid === localFirebaseUid) continue;
    if (localOpenChannelId) {
      if (entry.voice.openChannelId === localOpenChannelId) peers.push(uid);
      continue;
    }
    if (entry.voice.inPrivateCall && !entry.voice.openChannelId) peers.push(uid);
  }
  return peers;
}

/** Complète les pairs WebRTC avec la présence workspace (source la plus fiable). */
export function enrichVoiceRtcContextWithPresence(
  context: VoiceRtcContext,
  presenceMembers: Record<string, { voice: PresenceVoiceSnapshot }> | undefined,
  localFirebaseUid: string,
  localOpenChannelId: string | null,
): VoiceRtcContext {
  const presencePeers = context.sessionId.startsWith("theater__")
    ? theaterPeerUids(presenceMembers, localFirebaseUid)
    : presencePeerUids(presenceMembers, localFirebaseUid, localOpenChannelId);
  const peerUids = uniquePeerUids([...context.peerUids, ...presencePeers], localFirebaseUid);
  if (
    peerUids.length === context.peerUids.length &&
    peerUids.every((uid, index) => uid === context.peerUids[index])
  ) {
    return context;
  }

  if (
    context.sessionId.startsWith("block__") ||
    context.sessionId.startsWith("open__") ||
    context.sessionId.startsWith("theater__")
  ) {
    return { ...context, peerUids };
  }

  let sessionId = context.sessionId;
  if (context.sessionId.startsWith("private__")) {
    sessionId = sessionIdForPeers("private", localFirebaseUid, peerUids);
  }

  return { ...context, sessionId, peerUids };
}

/** Session WebRTC de secours quand l'UI locale n'a pas encore les bons blocs. */
export function voiceRtcContextFromPresence(input: {
  workspaceId: string;
  localFirebaseUid: string;
  localOpenChannelId: string | null;
  presenceMembers: Record<string, { voice: PresenceVoiceSnapshot }> | undefined;
}): VoiceRtcContext | null {
  const peerUids = uniquePeerUids(
    presencePeerUids(
      input.presenceMembers,
      input.localFirebaseUid,
      input.localOpenChannelId,
    ),
    input.localFirebaseUid,
  );
  if (peerUids.length === 0) return null;

  if (input.localOpenChannelId) {
    return {
      workspaceId: input.workspaceId,
      sessionId: `open__${input.localOpenChannelId}`,
      peerUids,
    };
  }

  return {
    workspaceId: input.workspaceId,
    sessionId: sessionIdForPeers("private", input.localFirebaseUid, peerUids),
    peerUids,
  };
}

/** Session WebRTC du théâtre — tous les participants présents entendent les intervenants. */
export function resolveTheaterRtcContext(input: {
  workspaceId: string;
  localFirebaseUid: string;
  localInTheaterCall: boolean;
  presenceMembers: Record<string, { voice: PresenceVoiceSnapshot }> | undefined;
}): VoiceRtcContext | null {
  if (!input.localInTheaterCall || !input.localFirebaseUid || !input.workspaceId) return null;

  const peerUids = uniquePeerUids(
    theaterPeerUids(input.presenceMembers, input.localFirebaseUid),
    input.localFirebaseUid,
  );

  return {
    workspaceId: input.workspaceId,
    sessionId: `theater__${input.workspaceId}`,
    peerUids,
  };
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

  if (localOpenChannelId) {
    const channel = roomCalls?.openChannels.find((entry) => entry.id === localOpenChannelId);
    const peerUids = uniquePeerUids(
      channel?.participants.map((participant) => participant.id) ?? [],
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
  if (!localBlock || !localInCall) return null;

  if (localBlock.participants.length > 1) {
    const peerUids = uniquePeerUids(
      localBlock.participants.map((participant) => participant.id),
      localFirebaseUid,
    );
    return {
      workspaceId,
      sessionId: `block__${localBlock.id}`,
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

  return {
    workspaceId,
    sessionId: sessionIdForPeers("private", localFirebaseUid, peerUids),
    peerUids,
  };
}
