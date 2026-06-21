import clsx from "clsx";
import PanelToolbarButtons from "./toolbar/PanelToolbarButtons";
import WorkspaceBrandButton from "./workspace/WorkspaceBrandButton";
import WorkspaceInviteButton from "./workspace/WorkspaceInviteButton";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";
import { countBlockCallParticipants, createRoomCallsState } from "../lib/calls";

export default function AppChromeRow() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const activePage = useStore((s) => s.activePage);
  const viewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inBlockCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);

  const inOpenChannel = inBlockCall && !!localOpenChannelId;
  const roomCallsState = roomCalls ?? createRoomCallsState(activeRoomId);
  const inCallParticipantCount = countBlockCallParticipants(
    roomCallsState.blocks,
    roomCallsState.openChannels,
    inBlockCall,
    localOpenChannelId ?? null,
  );
  const callMediaActive =
    viewMode === "blocks" &&
    inBlockCall &&
    !inOpenChannel &&
    inCallParticipantCount >= 1 &&
    (screenSharing || cameraOn);

  const callImmersive =
    activePage !== "settings" &&
    (viewMode === "theater" || inOpenChannel || callMediaActive);

  return (
    <header className={clsx("app-chrome-row", callImmersive && "app-chrome-row--immersive")}>
      <div className="app-chrome-row__main">
        <div className="app-chrome-row__leading">
          <WorkspaceInviteButton />
        </div>
        <div className="app-chrome-row__brand">
          <WorkspaceBrandButton />
        </div>
        <div className="app-chrome-row__actions">
          <PanelToolbarButtons />
        </div>
      </div>
    </header>
  );
}
