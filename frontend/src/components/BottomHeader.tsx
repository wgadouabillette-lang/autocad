import clsx from "clsx";
import { useEffect, useRef } from "react";
import {
  Bell,
  Calendar,
  Circle,
  BarChart3,
  Hand,
  MessageSquare,
  Mic,
  Sparkles,
  ListTodo,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import NotificationsPanel from "./notifications/NotificationsPanel";
import { useCalendarOverlayStore } from "../store/useCalendarOverlayStore";
import { useCallsStore } from "../store/useCallsStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { countBlockCallParticipants } from "../lib/calls";
import {
  canLocalSpeak,
  countTheaterParticipants,
  isLocalInTheater,
} from "../lib/theater";
import { hasAiNotesAccess, hasFollowUpAccess } from "../lib/subscriptionPlans";
import { useAiNotesStore } from "../store/useAiNotesStore";
import { useFollowUpCaptureStore } from "../store/useFollowUpCaptureStore";
import { useActiveVoicePoll } from "../hooks/useActiveVoicePoll";
import { useVoicePollStore } from "../store/useVoicePollStore";
import { useStore } from "../store/useStore";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { BottomBarButton, BottomBarCapsule } from "./bottomBar/BottomBarControls";

const ICON_SIZE = 19;

export default function BottomHeader() {
  const notificationsAnchorRef = useRef<HTMLDivElement>(null);
  const isMobileLayout = useMobileLayout();
  const activeRoomId = useStore((s) => s.activeRoomId);
  const ensureRoom = useCallsStore((s) => s.ensureRoom);
  const viewMode = useCallsStore(
    (s) => s.callsViewModeByWorkspace[activeRoomId] ?? "blocks",
  );
  const inBlockCall = useCallsStore((s) => s.localInCallByRoom[activeRoomId] ?? false);
  const theater = useCallsStore((s) => s.theaterByWorkspace[activeRoomId]);
  const inTheaterCall = theater ? isLocalInTheater(theater) : false;
  const inCall = viewMode === "theater" ? inTheaterCall : inBlockCall;
  const canSpeak = theater ? canLocalSpeak(theater) : false;
  const localRole = theater?.localRole;
  const muted = useCallsStore((s) => s.muted);
  const raiseHand = useCallsStore((s) => s.raiseHand);
  const toggleTheaterRaiseHand = useCallsStore((s) => s.toggleTheaterRaiseHand);
  const toggleBlockRaiseHand = useCallsStore((s) => s.toggleBlockRaiseHand);
  const togglePollExperience = useVoicePollStore((s) => s.togglePollExperience);
  const pollComposerOpen = useVoicePollStore(
    (s) => s.composerOpenByWorkspace[activeRoomId] ?? false,
  );
  const pollVoteOpen = useVoicePollStore(
    (s) => s.votePanelOpenByWorkspace[activeRoomId] ?? false,
  );
  const pollExperienceOpen = pollComposerOpen || pollVoteOpen;
  const ingestPoll = useVoicePollStore((s) => s.ingestPoll);
  const activePoll = useActiveVoicePoll(activeRoomId);
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const mediaError = useCallsStore((s) => s.mediaError);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const recording = useCallsStore((s) => s.recording);
  const toggleMuted = useCallsStore((s) => s.toggleMuted);
  const toggleCamera = useCallsStore((s) => s.toggleCamera);
  const toggleScreenShare = useCallsStore((s) => s.toggleScreenShare);
  const toggleRecording = useCallsStore((s) => s.toggleRecording);
  const leaveCall = useCallsStore((s) => s.leaveCall);
  const toggleNotifications = useNotificationsStore((s) => s.togglePanel);
  const notificationsOpen = useNotificationsStore((s) => s.panelOpen);
  const notificationItems = useNotificationsStore((s) => s.items);
  const unreadNotifications = notificationItems.filter((n) => !n.read).length;
  const notificationBadge =
    notificationItems.length > 0 && unreadNotifications > 0
      ? unreadNotifications
      : undefined;
  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const toggleChatPanel = useStore((s) => s.toggleChatPanel);
  const toggleCalendar = useCalendarOverlayStore((s) => s.togglePanel);
  const calendarOpen = chatPanelOpen && chatPanelMode === "calendar";
  const chatOpen = chatPanelOpen && chatPanelMode === "agent";
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const inOpenChannel = inBlockCall && !!localOpenChannelId;
  const showHandRaiseControl =
    (viewMode === "theater" && inCall && localRole === "audience") ||
    (viewMode === "blocks" && inOpenChannel);
  const participantCount =
    viewMode === "theater" && inTheaterCall && theater
      ? countTheaterParticipants(theater)
      : countBlockCallParticipants(
          roomCalls?.blocks ?? [],
          roomCalls?.openChannels ?? [],
          inBlockCall,
          localOpenChannelId ?? null,
        );
  const inGroupCall = inCall && participantCount >= 2;
  const showPollControl = viewMode === "blocks";
  const showAssistButtons =
    inGroupCall &&
    hasAiNotesAccess(subscriptionPlan) &&
    hasFollowUpAccess(subscriptionPlan);
  const aiNotesActive = useAiNotesStore((s) => s.active);
  const aiNotesBusy = useAiNotesStore((s) => s.busy);
  const toggleAiNotes = useAiNotesStore((s) => s.toggle);
  const followUpActive = useFollowUpCaptureStore((s) => s.active);
  const followUpBusy = useFollowUpCaptureStore((s) => s.busy);
  const toggleFollowUp = useFollowUpCaptureStore((s) => s.toggle);

  useEffect(() => {
    ensureRoom(activeRoomId);
  }, [activeRoomId, ensureRoom]);

  useEffect(() => {
    for (const item of notificationItems) {
      if (
        item.kind === "poll" &&
        !item.read &&
        item.pollSnapshot &&
        (!item.pollWorkspaceId || item.pollWorkspaceId === activeRoomId)
      ) {
        ingestPoll(item.pollSnapshot);
      }
    }
  }, [notificationItems, activeRoomId, ingestPoll]);

  const micLabel =
    mediaError ??
    (viewMode === "theater" && !canSpeak && inCall
      ? "Micro coupé (spectateur)"
      : muted
        ? "Réactiver le micro"
        : "Couper le micro");
  const handLabel = raiseHand ? "Baisser la main" : "Lever la main";
  const cameraLabel = cameraOn ? "Couper la caméra" : "Activer la caméra";

  const notificationButton = (
    <BottomBarButton
      label="Notifications"
      onClick={toggleNotifications}
      active={notificationsOpen}
      badge={notificationBadge}
    >
      <Bell size={ICON_SIZE} />
    </BottomBarButton>
  );

  const callControls = (
    <>
      {showHandRaiseControl && (
        <BottomBarButton
          label={handLabel}
          onClick={() =>
            viewMode === "theater"
              ? toggleTheaterRaiseHand(activeRoomId)
              : toggleBlockRaiseHand(activeRoomId)
          }
          active={raiseHand}
        >
          <Hand size={ICON_SIZE} />
        </BottomBarButton>
      )}

      {showPollControl && (
        <BottomBarButton
          label={
            pollExperienceOpen
              ? "Fermer le sondage"
              : activePoll
                ? "Voir le sondage"
                : "Sondage"
          }
          onClick={() => togglePollExperience(activeRoomId)}
          active={pollExperienceOpen}
        >
          <BarChart3 size={ICON_SIZE} />
        </BottomBarButton>
      )}

      <BottomBarButton
        label={micLabel}
        onClick={() => void toggleMuted()}
        active={muted || (viewMode === "theater" && inCall && !canSpeak)}
      >
        {muted || (viewMode === "theater" && inCall && !canSpeak) ? (
          <MicOff size={ICON_SIZE} />
        ) : (
          <Mic size={ICON_SIZE} />
        )}
      </BottomBarButton>

      <BottomBarButton
        label={cameraLabel}
        onClick={() => void toggleCamera()}
        active={cameraOn}
        disabled={viewMode === "theater" && !inCall}
      >
        {cameraOn ? <Video size={ICON_SIZE} /> : <VideoOff size={ICON_SIZE} />}
      </BottomBarButton>

      <BottomBarButton
        label="Partage d'écran"
        onClick={() => void toggleScreenShare()}
        active={screenSharing}
        disabled={viewMode === "theater" && !inCall}
      >
        <MonitorUp size={ICON_SIZE} />
      </BottomBarButton>

      {showAssistButtons && (
        <BottomBarButton
          label={
            aiNotesBusy
              ? "Préparation AI Notes…"
              : aiNotesActive
                ? "Arrêter AI Notes"
                : "AI Notes"
          }
          onClick={() => void toggleAiNotes(activeRoomId)}
          active={aiNotesActive}
          disabled={aiNotesBusy}
        >
          <Sparkles size={ICON_SIZE} />
        </BottomBarButton>
      )}

      {showAssistButtons && (
        <BottomBarButton
          label={
            followUpBusy
              ? "Traitement follow-up…"
              : followUpActive
                ? "Arrêter Follow-up"
                : "Follow-up"
          }
          onClick={() => void toggleFollowUp(activeRoomId)}
          active={followUpActive}
          disabled={followUpBusy}
        >
          <ListTodo size={ICON_SIZE} />
        </BottomBarButton>
      )}

      {(inCall || viewMode === "theater") && (
        <BottomBarButton
          label={viewMode === "theater" && inTheaterCall ? "Quitter le théâtre" : "Quitter"}
          onClick={() => leaveCall(activeRoomId)}
          danger
        >
          <PhoneOff size={ICON_SIZE} />
        </BottomBarButton>
      )}
    </>
  );

  const utilityControls = (
    <>
      <BottomBarButton
        label="Calendrier"
        onClick={toggleCalendar}
        active={calendarOpen}
      >
        <Calendar size={ICON_SIZE} />
      </BottomBarButton>

      <BottomBarButton
        label={chatOpen ? "Fermer l'agent" : "Ouvrir l'agent"}
        onClick={toggleChatPanel}
        active={chatOpen}
      >
        <MessageSquare size={ICON_SIZE} />
      </BottomBarButton>

      <BottomBarButton
        label={recording ? "Arrêter l'enregistrement" : "Enregistrement"}
        onClick={() => void toggleRecording()}
        active={recording}
        recording={recording}
      >
        <Circle size={ICON_SIZE} className={clsx(recording && "fill-current")} />
      </BottomBarButton>
    </>
  );

  if (isMobileLayout) {
    return (
      <footer className="app-bottom-header app-bottom-header--mobile">
        <div
          ref={notificationsAnchorRef}
          className="bottom-bar-capsule-anchor app-bottom-header__unified"
        >
          <NotificationsPanel
            anchorRef={notificationsAnchorRef}
            underChatPanel={chatPanelOpen}
          />
          <BottomBarCapsule>
            {notificationButton}
            {callControls}
            {utilityControls}
          </BottomBarCapsule>
        </div>
      </footer>
    );
  }

  return (
    <footer className="app-bottom-header">
      <div
        ref={notificationsAnchorRef}
        className="bottom-bar-capsule-anchor app-bottom-header__cluster"
      >
        <NotificationsPanel anchorRef={notificationsAnchorRef} underChatPanel={false} />
        <BottomBarCapsule>{notificationButton}</BottomBarCapsule>
      </div>

      <BottomBarCapsule>{callControls}</BottomBarCapsule>

      <div className="bottom-bar-capsule-anchor app-bottom-header__cluster app-bottom-header__cluster--end">
        <BottomBarCapsule>{utilityControls}</BottomBarCapsule>
      </div>
    </footer>
  );
}
