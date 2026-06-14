import { useEffect, useRef } from "react";
import { isBlockInCall, type CallBlock } from "../lib/calls";
import { playVoiceJoinSound, playVoiceLeaveSound } from "../lib/voiceChannelSounds";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";

function voiceParticipantIds(blocks: CallBlock[], localInCall: boolean): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (!isBlockInCall(block, localInCall)) continue;
    for (const user of block.participants) {
      ids.add(user.id);
    }
  }
  return ids;
}

/** Sons quand d'autres participants rejoignent ou quittent le salon vocal actif. */
export function useVoiceChannelSounds() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const localInCall = useCallsStore((s) => s.localInCallByRoom[activeRoomId] ?? false);
  const prevIdsRef = useRef<Set<string> | null>(null);
  const prevRoomRef = useRef(activeRoomId);

  useEffect(() => {
    if (prevRoomRef.current !== activeRoomId) {
      prevRoomRef.current = activeRoomId;
      prevIdsRef.current = null;
    }

    const blocks = roomCalls?.blocks;
    if (!blocks) return;

    const currentIds = voiceParticipantIds(blocks, localInCall);
    const prevIds = prevIdsRef.current;
    prevIdsRef.current = currentIds;

    if (!prevIds) return;

    for (const id of currentIds) {
      if (id === "local" || prevIds.has(id)) continue;
      playVoiceJoinSound({ remote: true });
    }

    for (const id of prevIds) {
      if (id === "local" || currentIds.has(id)) continue;
      playVoiceLeaveSound({ remote: true });
    }
  }, [activeRoomId, roomCalls, localInCall]);
}
