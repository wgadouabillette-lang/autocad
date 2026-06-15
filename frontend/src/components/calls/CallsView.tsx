import clsx from "clsx";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useVoiceChannelSounds } from "../../hooks/useVoiceChannelSounds";
import { useCallsStore } from "../../store/useCallsStore";
import { useStore } from "../../store/useStore";
import CallPresentView from "./CallPresentView";
import CallsVoiceGrid from "./CallsVoiceGrid";
import VoiceParticipantsInCallGrid from "./VoiceParticipantsInCallGrid";
import {
  countBlockCallParticipants,
  createRoomCallsState,
  inCallParticipants,
} from "../../lib/calls";
import { createTheaterState } from "../../lib/theater";
import { debugLog } from "../../lib/debugLog";
import GroupCallActionsBar from "./GroupCallActionsBar";
import HandRaiseOverlay from "./HandRaiseOverlay";
import JoinKnockOverlay from "./JoinKnockOverlay";
import MiniChatPopover from "../messages/MiniChatPopover";
import OpenVoiceInCallView from "./OpenVoiceInCallView";
import TheaterView from "./TheaterView";
import CallsViewHexDecor from "./CallsViewHexDecor";

let callsViewRenderCount = 0;

export default function CallsView() {
  callsViewRenderCount += 1;
  // #region agent log
  if (callsViewRenderCount <= 40 || callsViewRenderCount % 20 === 0) {
    debugLog(
      "CallsView.tsx:render",
      "CallsView render",
      { callsViewRenderCount },
      "C",
    );
  }
  // #endregion
  useVoiceChannelSounds();

  const activeRoomId = useStore((s) => s.activeRoomId);
  const workspaceSwitching = useStore((s) => s.workspaceSwitching);
  const viewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inBlockCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const inTheaterCall = useCallsStore((s) => s.isLocalInTheaterCall(activeRoomId));
  const ensureRoom = useCallsStore((s) => s.ensureRoom);
  const requestJoin = useCallsStore((s) => s.requestJoin);
  const openTheaterView = useCallsStore((s) => s.openTheaterView);
  const startOpenChannelDraft = useCallsStore((s) => s.startOpenChannelDraft);
  const purgeIdleOpenChannels = useCallsStore((s) => s.purgeIdleOpenChannels);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const theater = useCallsStore((s) => s.theaterByWorkspace[activeRoomId]);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const inCall = viewMode === "theater" ? inTheaterCall : inBlockCall;
  const inOpenChannel = inBlockCall && !!localOpenChannelId;
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // #region agent log
    debugLog(
      "CallsView.tsx:useLayoutEffect",
      "CallsView ensureRoom effect",
      { activeRoomId },
      "A",
    );
    // #endregion
    ensureRoom(activeRoomId);
    purgeIdleOpenChannels();
  }, [activeRoomId, ensureRoom, purgeIdleOpenChannels]);

  useEffect(() => {
    purgeIdleOpenChannels();
    const intervalId = window.setInterval(purgeIdleOpenChannels, 60_000);
    return () => window.clearInterval(intervalId);
  }, [purgeIdleOpenChannels]);

  const roomCallsState = useMemo(
    () => roomCalls ?? createRoomCallsState(activeRoomId),
    [roomCalls, activeRoomId],
  );
  const theaterState = useMemo(
    () => theater ?? createTheaterState(activeRoomId),
    [theater, activeRoomId],
  );
  const blocks = roomCallsState.blocks;
  const openChannels = roomCallsState.openChannels;
  const requests = roomCallsState.requests;

  const inCallParticipantCount = countBlockCallParticipants(
    blocks,
    openChannels,
    inBlockCall,
    localOpenChannelId ?? null,
  );
  const showSoloInCallMedia =
    viewMode === "blocks" &&
    inBlockCall &&
    !inOpenChannel &&
    inCallParticipantCount === 1 &&
    (screenSharing || cameraOn);
  const showPresentLayout =
    viewMode === "blocks" &&
    inBlockCall &&
    !inOpenChannel &&
    inCallParticipantCount >= 2 &&
    (screenSharing || cameraOn);
  const soloInCallParticipants = inCallParticipants(
    blocks,
    openChannels,
    inBlockCall,
    localOpenChannelId ?? null,
  );

  return (
    <div
      className={clsx(
        "calls-view",
        viewMode === "theater" && "calls-view--theater",
        inOpenChannel && "calls-view--open-channel",
        workspaceSwitching && "calls-view--loading",
      )}
    >
      {workspaceSwitching ? (
        <p className="text-sm text-muted-400" role="status">
          Chargement du workspace…
        </p>
      ) : null}
      {!workspaceSwitching ? (
        <>
      <CallsViewHexDecor />
      {viewMode === "theater" ? (
        <TheaterView workspaceId={activeRoomId} theater={theaterState} />
      ) : inOpenChannel && inBlockCall && localOpenChannelId ? (
        <OpenVoiceInCallView
          channelId={localOpenChannelId}
          openChannels={openChannels}
        />
      ) : showSoloInCallMedia ? (
        <VoiceParticipantsInCallGrid
          workspaceId={activeRoomId}
          participants={soloInCallParticipants}
        />
      ) : showPresentLayout ? (
        <CallPresentView blocks={blocks} />
      ) : (
        <div ref={stageRef} className="calls-view__stage">
          <CallsVoiceGrid
            key={activeRoomId}
            measureRef={stageRef}
            blocks={blocks}
            openChannels={openChannels}
            requests={requests}
            theater={theaterState}
            onRequestJoin={(blockId) => requestJoin(activeRoomId, blockId)}
            onOpenTheater={() => openTheaterView(activeRoomId)}
            onStartOpenChannelDraft={() => startOpenChannelDraft(activeRoomId)}
          />
        </div>
      )}

      <GroupCallActionsBar />
      {viewMode === "blocks" && <JoinKnockOverlay />}
      {viewMode === "theater" && <HandRaiseOverlay theater={theaterState} />}
      <MiniChatPopover />
        </>
      ) : null}
    </div>
  );
}
