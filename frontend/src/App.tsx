import clsx from "clsx";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import AppChromeRow from "./components/AppChromeRow";
import AppLoadingScreen from "./components/AppLoadingScreen";
import ChatPanelShell from "./components/ChatPanelShell";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import SettingsPage from "./components/SettingsPage";
import RecordingCameraPreview from "./components/calls/RecordingCameraPreview";
import AuthPage from "./components/auth/AuthPage";
import { useCallVoiceActivity } from "./hooks/useCallVoiceActivity";
import { useWorkspacePresence } from "./hooks/useWorkspacePresence";
import { useWorkspaceJoinRequests } from "./hooks/useWorkspaceJoinRequests";
import { useWorkspaceVoiceKnocks } from "./hooks/useWorkspaceVoiceKnocks";
import { useWorkspaceVoiceRtc } from "./hooks/useWorkspaceVoiceRtc";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { useDesktopUpdater } from "./hooks/useDesktopUpdater";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { runAppBoot, type AppBootStatus } from "./lib/appBoot";
import { runDashboardOnboardingIfNeeded } from "./lib/dashboardOnboarding";
import { readUserPreferences } from "./lib/userPreferences";
import { useAuthStore } from "./store/useAuthStore";
import { useWorkspacesStore } from "./store/useWorkspacesStore";
import { useCallsStore } from "./store/useCallsStore";
import { useStore } from "./store/useStore";
import { useNotificationsStore } from "./store/useNotificationsStore";
import { usePeopleStore } from "./store/usePeopleStore";
import { useWorkspacePresenceStore } from "./store/useWorkspacePresenceStore";
import { LOCAL_USER_ID } from "./lib/workspaces";
import { debugLog } from "./lib/debugLog";

let appRenderCount = 0;

export default function App() {
  appRenderCount += 1;
  // #region agent log
  if (appRenderCount <= 40 || appRenderCount % 20 === 0) {
    debugLog(
      "App.tsx:render",
      "App render",
      { appRenderCount },
      "C",
    );
  }
  // #endregion
  const [bootStatus, setBootStatus] = useState<AppBootStatus>("loading");
  const isMobileLayout = useMobileLayout();
  const activePage = useStore((s) => s.activePage);
  const chatPanelOpen = useStore((s) => s.chatPanelOpen);
  const chatPanelExpanded = useStore((s) => s.chatPanelExpanded);
  const chatPanelLeaveAnimating = useStore((s) => s.chatPanelLeaveAnimating);
  const chatFullscreenOverlay =
    !isMobileLayout && (chatPanelExpanded || chatPanelLeaveAnimating);
  const sidePanelSide = useStore((s) => s.sidePanelSide);
  const panelOnLeft = sidePanelSide === "left";
  const activeRoomId = useStore((s) => s.activeRoomId);
  const callsViewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inBlockCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const inTheaterCall = useCallsStore((s) => s.isLocalInTheaterCall(activeRoomId));
  const inVoiceCall =
    callsViewMode === "theater" ? inTheaterCall : inBlockCall;
  const recording = useCallsStore((s) => s.recording);
  const handleRecordingStreamEnded = useCallsStore((s) => s.handleRecordingStreamEnded);
  const handleRecordingCaptureLost = useCallsStore((s) => s.handleRecordingCaptureLost);
  const pushNotification = useNotificationsStore((s) => s.push);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authReady = useAuthStore((s) => s.ready);
  const authEmail = useAuthStore((s) => s.authEmail);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const syncWorkspacesToCloud = useAuthStore((s) => s.syncWorkspacesToCloud);
  const workspaceSwitching = useStore((s) => s.workspaceSwitching);
  const finishWorkspaceSwitch = useStore((s) => s.finishWorkspaceSwitch);
  const presenceLoaded = useWorkspacePresenceStore((s) =>
    activeRoomId ? s.isLoaded(activeRoomId) : true,
  );

  const runBoot = useCallback(async () => {
    setBootStatus("loading");
    const status = await runAppBoot();
    setBootStatus(status);
  }, []);

  useAppKeyboardShortcuts();
  useDesktopUpdater();
  useCallVoiceActivity(inVoiceCall);
  useWorkspacePresence();
  useWorkspaceJoinRequests();
  useWorkspaceVoiceKnocks();
  useWorkspaceVoiceRtc();

  useEffect(() => {
    if (!workspaceSwitching) return;
    if (presenceLoaded) {
      finishWorkspaceSwitch();
      return;
    }
    const timeoutId = window.setTimeout(() => {
      finishWorkspaceSwitch();
    }, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [workspaceSwitching, activeRoomId, presenceLoaded, finishWorkspaceSwitch]);

  useEffect(() => {
    if (!isMobileLayout) return;
    const state = useStore.getState();
    if (!state.chatPanelExpanded && !state.chatPanelLeaveAnimating) return;
    useStore.setState({
      chatPanelExpanded: false,
      chatPanelLeaveAnimating: false,
    });
  }, [isMobileLayout]);

  const layoutStyle = {
    "--app-chat-col":
      chatPanelOpen && !isMobileLayout ? "var(--forma-chat-panel-width)" : "0px",
  } as CSSProperties;

  useEffect(() => {
    const stopAuth = hydrateAuth();
    useWorkspacesStore.getState().hydrate();

    const ensureAllRooms = () => {
      const ensureRoom = useCallsStore.getState().ensureRoom;
      const ownerUserId = useAuthStore.getState().firebaseUid ?? LOCAL_USER_ID;
      const activeRoomId = useStore.getState().activeRoomId;
      if (activeRoomId) ensureRoom(activeRoomId);
      for (const workspace of useWorkspacesStore.getState().joinedWorkspaces(ownerUserId)) {
        ensureRoom(workspace.id);
      }
    };
    ensureAllRooms();

    const stopWorkspaceSync = useWorkspacesStore.subscribe((state, prev) => {
      if (
        state.memberships === prev.memberships &&
        state.customServers === prev.customServers
      ) {
        return;
      }
      ensureAllRooms();
      if (useAuthStore.getState().firebaseUid) {
        void syncWorkspacesToCloud();
      }
    });

    const prefs = readUserPreferences();
    useStore.setState({
      chatPanelOpen: prefs.chatPanelOpen,
      sidePanelSide: prefs.sidePanelSide,
      showChatHistory: false,
      chatPanelMode: "agent",
    });
    void runBoot();
    return () => {
      stopWorkspaceSync();
      stopAuth();
    };
  }, [hydrateAuth, runBoot, syncWorkspacesToCloud]);

  useEffect(() => {
    if (!isAuthenticated || !authEmail) return;
    useNotificationsStore.getState().hydrate(authEmail);
  }, [isAuthenticated, authEmail]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid || !authEmail) return;
    return usePeopleStore.getState().hydrateFriendRequests(firebaseUid, authEmail);
  }, [isAuthenticated, firebaseUid, authEmail]);

  useEffect(() => {
    if (!isAuthenticated || !firebaseUid) {
      usePeopleStore.getState().subscribeFriendChats(null);
      return;
    }
    usePeopleStore.getState().subscribeFriendChats(firebaseUid);
    const unsubscribe = usePeopleStore.subscribe((state, prev) => {
      if (state.friends === prev.friends) return;
      // #region agent log
      debugLog(
        "App.tsx:peopleSubscribe",
        "friends changed, resubscribe chats",
        { friendCount: state.friends.length },
        "E",
      );
      // #endregion
      usePeopleStore.getState().subscribeFriendChats(firebaseUid);
    });
    return () => {
      unsubscribe();
      usePeopleStore.getState().subscribeFriendChats(null);
    };
  }, [isAuthenticated, firebaseUid]);

  useEffect(() => {
    if (bootStatus !== "ready" || !isAuthenticated || !authEmail) {
      return;
    }
    void runDashboardOnboardingIfNeeded(authEmail, firebaseUid);
  }, [bootStatus, isAuthenticated, authEmail, firebaseUid]);

  useEffect(() => {
    if (bootStatus !== "ready" || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const workspaceInvite = params.get("workspace")?.trim().toLowerCase();
    if (!workspaceInvite) return;

    useWorkspacesStore.getState().setPendingInviteWorkspaceId(workspaceInvite);
    useStore.getState().openSettingsPage();
    useStore.getState().openSettingsTab("workspaces");

    params.delete("workspace");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [bootStatus, isAuthenticated]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("connector_oauth");
    if (!oauth) return;
    const connectorId = params.get("connector_id");
    if (oauth === "success") {
      window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
      if (connectorId) {
        pushNotification({
          kind: "connector",
          title: `${connectorId} connected`,
          body: "Your account is linked and ready to use in chat.",
        });
      }
    }
    params.delete("connector_oauth");
    params.delete("connector_id");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [pushNotification]);

  useEffect(() => {
    const onEnded = () => {
      void handleRecordingStreamEnded();
    };
    const onLost = () => {
      void handleRecordingCaptureLost();
    };
    window.addEventListener("forma-app-recording-ended", onEnded);
    window.addEventListener("forma-app-recording-lost", onLost);
    return () => {
      window.removeEventListener("forma-app-recording-ended", onEnded);
      window.removeEventListener("forma-app-recording-lost", onLost);
    };
  }, [handleRecordingStreamEnded, handleRecordingCaptureLost]);

  if (!authReady) {
    return (
      <AppLoadingScreen
        connectionError={false}
        label="Chargement…"
      />
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  if (bootStatus !== "ready") {
    return (
      <AppLoadingScreen
        connectionError={bootStatus === "connection_error"}
        onRetry={() => void runBoot()}
      />
    );
  }

  return (
    <div className="app-shell">
      {recording && <div className="app-recording-frame" aria-hidden />}
      <RecordingCameraPreview />
      {workspaceSwitching ? (
        <AppLoadingScreen connectionError={false} label="Chargement du workspace…" />
      ) : null}
      <div
        className={clsx(
          "app-layout",
          chatPanelOpen && "app-layout--chat-open",
          isMobileLayout && "app-layout--mobile",
          chatFullscreenOverlay && "app-layout--chat-fullscreen-overlay",
          panelOnLeft ? "app-layout--panel-left" : "app-layout--panel-right",
        )}
        style={layoutStyle}
      >
        <AppChromeRow />
        <main className="app-layout__main">
          {activePage === "settings" ? <SettingsPage /> : <CallsView />}
        </main>
        <BottomHeader />
        {chatPanelOpen && <ChatPanelShell key={sidePanelSide} />}
      </div>
    </div>
  );
}
