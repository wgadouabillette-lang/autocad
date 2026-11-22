import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Calendar,
  Circle,
  BarChart3,
  Hand,
  MessageSquare,
  Mic,
  Sparkles,
  SkipForward,
  MicOff,
  MonitorUp,
  PhoneOff,
  Square,
  Volume2,
  Video,
  VideoOff,
} from "lucide-react";
import NotificationsPanel from "./notifications/NotificationsPanel";
import { useCalendarOverlayStore } from "../store/useCalendarOverlayStore";
import { useCallsStore } from "../store/useCallsStore";
import { useDirectCallStore } from "../store/useDirectCallStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { countBlockCallParticipants, isLocalPrivateCallHost } from "../lib/calls";
import {
  canLocalSpeak,
  countTheaterParticipants,
  isLocalInTheater,
} from "../lib/theater";
import { hasAiNotesAccess, hasVoicePollAccess } from "../lib/subscriptionPlans";
import { useAiNotesStore } from "../store/useAiNotesStore";
import { useActiveVoicePoll } from "../hooks/useActiveVoicePoll";
import { useVoicePollStore } from "../store/useVoicePollStore";
import { useStore } from "../store/useStore";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { useConnectors } from "../hooks/useConnectors";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../lib/connectorIcons";
import { PLAY_SKILL_TEMPLATE } from "../lib/playSkill";
import { useHallDjStore } from "../store/useHallDjStore";
import { useTranslation } from "react-i18next";
import { isMarketingPreview } from "../lib/marketingPreview";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { warmSpotifyWebPlayer, activateSpotifyPlaybackFromUserGesture } from "../lib/spotifyWebPlayback";
import { BottomBarButton, BottomBarCapsule } from "./bottomBar/BottomBarControls";
import HallDjDiscoIcon from "./bottomBar/HallDjDiscoIcon";
const ICON_SIZE = 19;

export default function BottomHeader() {
  const { t } = useTranslation();
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
  const pollVoteOpenRaw = useVoicePollStore(
    (s) => s.votePanelOpenByWorkspace[activeRoomId] ?? false,
  );
  const ingestPoll = useVoicePollStore((s) => s.ingestPoll);
  const activePoll = useActiveVoicePoll(activeRoomId);
  const pollVoteOpen = pollVoteOpenRaw && !!activePoll;
  const pollExperienceOpen = pollComposerOpen || pollVoteOpen;
  const cameraOn = useCallsStore((s) => s.cameraOn);
  const mediaError = useCallsStore((s) => s.mediaError);
  const screenSharing = useCallsStore((s) => s.screenSharing);
  const remoteMediaByUid = useCallsStore((s) => s.remoteMediaByUid);
  const remoteScreenShareVolume = useCallsStore((s) => s.remoteScreenShareVolume);
  const setRemoteScreenShareVolume = useCallsStore((s) => s.setRemoteScreenShareVolume);
  const recording = useCallsStore((s) => s.recording);
  const toggleMuted = useCallsStore((s) => s.toggleMuted);
  const toggleCamera = useCallsStore((s) => s.toggleCamera);
  const toggleScreenShare = useCallsStore((s) => s.toggleScreenShare);
  const toggleRecording = useCallsStore((s) => s.toggleRecording);
  const leaveCall = useCallsStore((s) => s.leaveCall);
  const directCallId = useDirectCallStore((s) => s.callId);
  const leaveDirectCall = useDirectCallStore((s) => s.leaveCall);
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
  const openAiNotesPanel = useStore((s) => s.openAiNotesPanel);
  const toggleCalendar = useCalendarOverlayStore((s) => s.togglePanel);
  const calendarOpen = chatPanelOpen && chatPanelMode === "calendar";
  const chatOpen = chatPanelOpen && chatPanelMode === "agent";
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const roomCalls = useCallsStore((s) => s.callsByRoom[activeRoomId]);
  const localOpenChannelId = useCallsStore((s) => s.localOpenChannelByRoom[activeRoomId]);
  const inOpenChannel = inBlockCall && !!localOpenChannelId;
  const showHandRaiseControl =
    inCall &&
    (viewMode === "blocks" || (viewMode === "theater" && localRole === "audience"));
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
  const isPrivateCallHost =
    viewMode === "blocks" &&
    inBlockCall &&
    !inOpenChannel &&
    isLocalPrivateCallHost(roomCalls?.blocks ?? [], activeRoomId);
  const showLeaveCall =
    viewMode === "theater" ||
    (inBlockCall && inOpenChannel) ||
    (inBlockCall && !inOpenChannel && inGroupCall && !isPrivateCallHost);
  const isTheaterSpeaker =
    viewMode === "theater" && inCall && localRole === "speaker";
  const isTheaterAudienceWithPoll =
    viewMode === "theater" && inCall && !isTheaterSpeaker && !!activePoll;
  const showPollControl =
    viewMode === "blocks" || isTheaterSpeaker || isTheaterAudienceWithPoll;
  const pollKind: "regular" | "theater" = isTheaterSpeaker ? "theater" : "regular";
  const canCreatePoll = hasVoicePollAccess(
    subscriptionPlan,
    billingManaged,
    workspaceEnterpriseActive,
  );
  const showAssistButtons =
    inCall && hasAiNotesAccess(subscriptionPlan, billingManaged, workspaceEnterpriseActive);
  const aiNotesActive = useAiNotesStore((s) => s.active);
  const aiNotesBusy = useAiNotesStore((s) => s.busy);
  const toggleAiNotes = useAiNotesStore((s) => s.toggle);
  const openSpotifyPanel = useStore((s) => s.insertAgentComposerText);
  const stopSpotify = useSpotifyPlayerStore((s) => s.stop);
  const spotifyCurrentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const spotifyPlaying = useSpotifyPlayerStore((s) => s.playing);
  const queueAddFlashAt = useSpotifyPlayerStore((s) => s.queueAddFlashAt);
  const hallDjLoading = useHallDjStore((s) => s.loading);
  const hallDjActive = useHallDjStore((s) => s.active);
  const hallDjError = useHallDjStore((s) => s.error);
  const startHallDj = useHallDjStore((s) => s.startDj);
  const skipHallDjTrack = useHallDjStore((s) => s.skipNext);
  const spotifyPremiumAvailable = useSpotifyPlayerStore((s) => s.premiumAvailable);
  const spotifyPlayerNotice = useSpotifyPlayerStore((s) => s.playerNotice);
  const refreshSpotifyPlayerConfig = useSpotifyPlayerStore((s) => s.refreshPlayerConfig);
  const [queueShimmer, setQueueShimmer] = useState(false);
  const { connectedIds, connect, connectingId, statuses } = useConnectors();
  const spotifyStatus = statuses.find((s) => s.id === "spotify");
  const spotifyConnected = connectedIds.has("spotify");
  const spotifyConfigured = spotifyStatus?.configured ?? false;
  const hallDjNeedsPremium = spotifyConnected && spotifyPremiumAvailable === false;

  useEffect(() => {
    ensureRoom(activeRoomId);
  }, [activeRoomId, ensureRoom]);

  useEffect(() => {
    if (!queueAddFlashAt) return;
    setQueueShimmer(true);
    const timer = window.setTimeout(() => setQueueShimmer(false), 1400);
    return () => window.clearTimeout(timer);
  }, [queueAddFlashAt]);

  const primeSpotifyOnIntent = () => {
    if (!spotifyConnected || connectingId === "spotify") return;
    warmSpotifyWebPlayer(true);
    void refreshSpotifyPlayerConfig();
  };

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
      ? t("bar.micMutedAudience")
      : muted
        ? t("bar.unmute")
        : t("bar.mute"));
  const theaterListenerLocked = viewMode === "theater" && inCall && !canSpeak;
  const handLabel = raiseHand
    ? t("bar.lowerHand")
    : t("bar.raiseHand");
  const cameraLabel = theaterListenerLocked
    ? t("bar.cameraUnavailable")
    : cameraOn
      ? t("bar.cameraOff")
      : t("bar.cameraOn");

  const notificationButton = (
    <BottomBarButton
      label={t("bar.inbox")}
      onClick={toggleNotifications}
      active={notificationsOpen}
      badge={notificationBadge}
      signetAlign="inward-start"
    >
      <Bell size={ICON_SIZE} />
    </BottomBarButton>
  );

  const spotifyPlaybackActive =
    spotifyCurrentTrack != null || hallDjActive || hallDjLoading;
  const spotifyStopLocked = isMarketingPreview() && spotifyPlaybackActive;
  const spotifyIconShimmerClass = queueShimmer ? "bottom-bar-btn__icon-shimmer" : undefined;

  const spotifyLabel = spotifyPlaybackActive
    ? spotifyPlaying && spotifyCurrentTrack
      ? `${t("bar.stopTrack")} · ${spotifyCurrentTrack.name}`
      : t("bar.stopMusic")
    : spotifyConnected
      ? "Spotify"
      : spotifyConfigured
        ? t("bar.connectSpotify")
        : t("bar.spotifyUnconfigured");

  const spotifyButton = (
    <BottomBarButton
      label={spotifyLabel}
      className={clsx(
        spotifyStopLocked ? "marketing-preview-locked" : undefined,
      )}
      onClick={() => {
        if (spotifyStopLocked) return;
        if (spotifyPlaybackActive) {
          stopSpotify();
          return;
        }
        if (!spotifyConnected) {
          void connect("spotify");
          return;
        }
        openSpotifyPanel(PLAY_SKILL_TEMPLATE);
      }}
      active={spotifyPlaybackActive || spotifyConnected}
      disabled={!spotifyConfigured || connectingId === "spotify"}
    >
      {spotifyPlaybackActive ? (
        <Square
          size={ICON_SIZE}
          fill="currentColor"
          aria-hidden
          className={queueShimmer ? spotifyIconShimmerClass : undefined}
        />
      ) : (
        <img
          src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
          alt=""
          className={clsx("bottom-bar-btn__connector-icon", spotifyIconShimmerClass)}
          width={ICON_SIZE}
          height={ICON_SIZE}
          draggable={false}
        />
      )}
    </BottomBarButton>
  );

  const showHallDjLoading = hallDjLoading;
  const showHallDjSkip = hallDjActive && !hallDjLoading;
  const hallDjPremiumLabel =
    t("bar.spotifyPremiumRequired");
  const hallDjIdleLabel =
    hallDjError?.trim() ||
    (spotifyPlayerNotice?.includes("Meetra DJ") ? spotifyPlayerNotice : null) ||
    t("bar.startDj");

  const spotifyDjButton = spotifyConnected ? (
    <BottomBarButton
      label={
        hallDjNeedsPremium && !showHallDjSkip
          ? hallDjPremiumLabel
          : showHallDjLoading
            ? "Meetra DJ…"
            : showHallDjSkip
              ? t("bar.nextTrack")
              : hallDjIdleLabel
      }
      onPointerEnter={primeSpotifyOnIntent}
      onFocus={primeSpotifyOnIntent}
      onClick={() => {
        if (showHallDjLoading) return;
        if (!spotifyConnected) {
          void connect("spotify");
          return;
        }
        if (showHallDjSkip) {
          void skipHallDjTrack();
          return;
        }
        if (hallDjNeedsPremium) {
          useSpotifyPlayerStore.setState({
            playerNotice: hallDjPremiumLabel,
          });
          return;
        }
        if (isMarketingPreview()) {
          void startHallDj();
          return;
        }
        void (async () => {
          // Keep Spotify activateElement in the click gesture chain (cold DJ start).
          await activateSpotifyPlaybackFromUserGesture();
          await startHallDj();
        })();
      }}
      disabled={connectingId === "spotify"}
      aria-busy={showHallDjLoading}
      active={showHallDjSkip || showHallDjLoading}
      className={clsx(
        hallDjNeedsPremium && !showHallDjSkip ? "bottom-bar-btn--wide-signet" : undefined,
        isMarketingPreview() && "marketing-preview-dj-btn",
      )}
    >
      {showHallDjLoading ? (
        <span
          className="hall-dj-loading-icon"
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
          aria-hidden
        >
          <svg className="hall-dj-loading-icon__ring" viewBox="0 0 24 24">
            <circle
              cx="12"
              cy="12"
              r="8.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeDasharray="13 40"
            />
          </svg>
        </span>
      ) : showHallDjSkip ? (
        <SkipForward size={ICON_SIZE} aria-hidden className={spotifyIconShimmerClass} />
      ) : (
        <HallDjDiscoIcon className={spotifyIconShimmerClass} />
      )}
    </BottomBarButton>
  ) : null;

  const callControls = (
    <>
      {showHandRaiseControl && (
        <BottomBarButton
          label={handLabel}
          onClick={() => {
            if (viewMode === "theater") {
              toggleTheaterRaiseHand(activeRoomId);
              return;
            }
            toggleBlockRaiseHand(activeRoomId);
          }}
          active={raiseHand}
        >
          <Hand size={ICON_SIZE} />
        </BottomBarButton>
      )}

      {showPollControl && (
        <BottomBarButton
          label={
            pollExperienceOpen
              ? t("bar.closePoll")
              : activePoll
                ? t("chatUi.viewPoll")
                : !canCreatePoll
                  ? t("bar.pollNeedsPro")
                  : isTheaterSpeaker
                    ? t("bar.theaterPoll30")
                    : t("bar.poll")
          }
          onClick={() => togglePollExperience(activeRoomId, pollKind)}
          active={pollExperienceOpen}
          className={
            !canCreatePoll && !activePoll && !pollExperienceOpen
              ? "bottom-bar-btn--wide-signet"
              : undefined
          }
        >
          <BarChart3 size={ICON_SIZE} />
        </BottomBarButton>
      )}

      {showAssistButtons && (
        <BottomBarButton
          label={
            aiNotesBusy
              ? t("bar.preparingNotes")
              : aiNotesActive
                ? t("bar.openNotes")
                : "AI Notes"
          }
          onClick={() => {
            openAiNotesPanel();
            if (!aiNotesActive) void toggleAiNotes(activeRoomId);
          }}
          active={aiNotesActive}
          disabled={aiNotesBusy}
        >
          <Sparkles size={ICON_SIZE} />
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
        disabled={(viewMode === "theater" && !inCall) || theaterListenerLocked}
      >
        {cameraOn ? <Video size={ICON_SIZE} /> : <VideoOff size={ICON_SIZE} />}
      </BottomBarButton>

      <BottomBarButton
        label={
          theaterListenerLocked
            ? t("bar.screenShareUnavailable")
            : t("bar.shareScreen")
        }
        onClick={() => void toggleScreenShare()}
        active={screenSharing}
        disabled={(viewMode === "theater" && !inCall) || theaterListenerLocked}
      >
        <MonitorUp size={ICON_SIZE} />
      </BottomBarButton>

      {inCall &&
        Object.values(remoteMediaByUid).some((media) =>
          media.screenStream?.getVideoTracks().some((track) => track.readyState === "live"),
        ) && (
          <label
            className="bottom-bar-screen-volume"
            title={t("bar.screenShareVolume")}
            aria-label={t("bar.screenShareVolumeOthers")}
          >
            <Volume2 size={14} aria-hidden />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(remoteScreenShareVolume * 100)}
              onChange={(event) =>
                setRemoteScreenShareVolume(Number(event.target.value) / 100)
              }
            />
          </label>
        )}

      {(showLeaveCall || directCallId) && (
        <BottomBarButton
          label={
            !directCallId && viewMode === "theater" && inTheaterCall
              ? t("bar.leaveTheater")
              : t("bar.leave")
          }
          onClick={() => {
            if (directCallId) leaveDirectCall();
            else leaveCall(activeRoomId);
          }}
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
        label={t("bar.calendar")}
        onClick={toggleCalendar}
        active={calendarOpen}
      >
        <Calendar size={ICON_SIZE} />
      </BottomBarButton>

      <BottomBarButton
        label={
          chatOpen
            ? t("bar.closeAgent")
            : t("bar.openAgent")
        }
        onClick={toggleChatPanel}
        active={chatOpen}
      >
        <MessageSquare size={ICON_SIZE} />
      </BottomBarButton>

      <BottomBarButton
        label={recording ? "Stop recording" : "Record"}
        onClick={() => void toggleRecording()}
        active={recording}
        recording={recording}
        signetAlign="inward-end"
        className={isMarketingPreview() ? "marketing-preview-record-btn" : undefined}
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
            {spotifyButton}
            {spotifyDjButton}
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
        <BottomBarCapsule>
          {notificationButton}
          {spotifyButton}
          {spotifyDjButton}
        </BottomBarCapsule>
      </div>

      <BottomBarCapsule>{callControls}</BottomBarCapsule>

      <div className="bottom-bar-capsule-anchor app-bottom-header__cluster app-bottom-header__cluster--end">
        <BottomBarCapsule>{utilityControls}</BottomBarCapsule>
      </div>
    </footer>
  );
}
