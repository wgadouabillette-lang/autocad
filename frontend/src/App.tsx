import clsx from "clsx";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import ChatFullscreenMediaPip from "./components/chat/ChatFullscreenMediaPip";
import AppChromeRow from "./components/AppChromeRow";
import PanelToolbarButtons from "./components/toolbar/PanelToolbarButtons";
import AppLoadingScreen from "./components/AppLoadingScreen";
import ChatPanelShell from "./components/ChatPanelShell";
import BottomHeader from "./components/BottomHeader";
import CallsView from "./components/calls/CallsView";
import SettingsPage from "./components/SettingsPage";
import RecordingCameraPreview from "./components/calls/RecordingCameraPreview";
import VoiceRemoteAudioSink from "./components/calls/VoiceRemoteAudioSink";
import AuthPage from "./components/auth/AuthPage";
import { useCallVoiceActivity } from "./hooks/useCallVoiceActivity";
import { useRemoteVoiceActivity } from "./hooks/useRemoteVoiceActivity";
import { useWorkspaceEnterprise } from "./hooks/useWorkspaceEnterprise";
import { useWorkspacePresence } from "./hooks/useWorkspacePresence";
import { useWorkspaceJoinRequests } from "./hooks/useWorkspaceJoinRequests";
import { useWorkspaceVoiceKnocks } from "./hooks/useWorkspaceVoiceKnocks";
import { useWorkspaceVoiceRtc } from "./hooks/useWorkspaceVoiceRtc";
import { useWorkspacePolls } from "./hooks/useWorkspacePolls";
import { useWorkspaceTextChannels } from "./hooks/useWorkspaceTextChannels";
import { useWorkspaceOpenVoiceChannels } from "./hooks/useWorkspaceOpenVoiceChannels";
import JoinKnockOverlay from "./components/calls/JoinKnockOverlay";
import WorkspaceOverlay from "./components/workspace/WorkspaceOverlay";
import WorkspaceQuickMenu from "./components/workspace/WorkspaceQuickMenu";
import { useColorTheme } from "./hooks/useColorTheme";
import { useAccentColor } from "./hooks/useAccentColor";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { useDesktopUpdater } from "./hooks/useDesktopUpdater";
import { useMeetingReminders } from "./hooks/useMeetingReminders";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { canAccessApp, DESKTOP_VIEWPORT_QUERY, getLandingUrl } from "./lib/appAccess";
import { runAppBoot, type AppBootStatus } from "./lib/appBoot";
import { runDashboardOnboardingIfNeeded } from "./lib/dashboardOnboarding";
import { normalizeSettingsTab } from "./lib/settingsSearchSuggestions";
import { readUserPreferences } from "./lib/userPreferences";
import { useAuthStore } from "./store/useAuthStore";
import { useWorkspacesStore } from "./store/useWorkspacesStore";
import { useCallsStore } from "./store/useCallsStore";
import { useStore } from "./store/useStore";
import { useNotificationsStore } from "./store/useNotificationsStore";
import { useConnectorsStore } from "./store/useConnectorsStore";
import { tryFinishConnectorOAuthFromStorage } from "./lib/connectorOAuthResult";
import { usePeopleStore } from "./store/usePeopleStore";
import { useWorkspacePresenceStore } from "./store/useWorkspacePresenceStore";
import { LOCAL_USER_ID } from "./lib/workspaces";
import { debugLog } from "./lib/debugLog";
import { billingApi } from "./lib/billingApi";

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

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_VIEWPORT_QUERY);
    const enforceDesktopAccess = () => {
      if (!canAccessApp()) {
        window.location.replace(getLandingUrl());
      }
    };
    enforceDesktopAccess();
    mediaQuery.addEventListener("change", enforceDesktopAccess);
    return () => mediaQuery.removeEventListener("change", enforceDesktopAccess);
  }, []);
  const activePage = useStore((s) => s.activePage);
  const settingsOpen = activePage === "settings";
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
  useColorTheme();
  useAccentColor();
  useDesktopUpdater();
  useMeetingReminders();
  useCallVoiceActivity(inVoiceCall);
  useRemoteVoiceActivity(inVoiceCall);
  useWorkspacePresence();
  useWorkspaceEnterprise();
  useWorkspaceJoinRequests();
  useWorkspaceVoiceKnocks();
  useWorkspaceVoiceRtc();
  useWorkspacePolls();
  useWorkspaceOpenVoiceChannels();
  useWorkspaceTextChannels();

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
    return () => {
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
    if (bootStatus !== "ready" || !isAuthenticated) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const tab = params.get("tab");
    if (checkout !== "success" && checkout !== "cancel" && !tab) return;

    useStore.getState().openSettingsTab(normalizeSettingsTab(tab ?? "usage"));

    if (checkout === "success") {
      void billingApi.sync().catch((err) => {
        debugLog(
          "App.tsx:checkout-sync",
          "post-checkout billing sync failed",
          { error: err instanceof Error ? err.message : String(err) },
          "billing",
        );
      });
    }

    params.delete("checkout");
    params.delete("tab");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, [bootStatus, isAuthenticated]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("connector_oauth");
    if (!oauth) return;
    const connectorId = params.get("connector_id");
    const oauthMessage = params.get("connector_oauth_message");
    if (oauth === "success") {
      void useConnectorsStore.getState().refresh(true);
      window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
      useConnectorsStore.getState().setConnectingId(null);
      if (window.opener === null && window.name.startsWith("forma-connector-oauth")) {
        window.setTimeout(() => window.close(), 150);
      }
    } else if (oauth === "error") {
      const detail =
        oauthMessage ??
        "Connexion au connecteur impossible. Vérifiez la configuration OAuth.";
      console.warn("[connector-oauth]", connectorId ?? "unknown", detail);
      useNotificationsStore.getState().push({
        kind: "workspace",
        title: "Connecteur non lié",
        body: detail,
      });
      useConnectorsStore.getState().setError(detail);
    }
    params.delete("connector_oauth");
    params.delete("connector_id");
    params.delete("connector_oauth_message");
    const next = params.toString();
    const url = `${window.location.pathname}${next ? `?${next}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
  }, []);

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

  const renderBranch = !authReady
    ? "loading-auth"
    : !isAuthenticated
      ? "auth-page"
      : bootStatus !== "ready"
        ? "loading-boot"
        : "app";
  // #region agent log
  if (appRenderCount <= 60 || renderBranch !== "app") {
    debugLog(
      "App.tsx:renderBranch",
      "App render branch",
      {
        renderBranch,
        authReady,
        isAuthenticated,
        bootStatus,
        authEmail,
        firebaseUid,
        pathname: window.location.pathname,
      },
      renderBranch === "auth-page" ? "C" : "D",
    );
  }
  // #endregion

  if (!authReady) {
    return (
      <AppLoadingScreen
        connectionError={false}
        label="Loading…"
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
      <VoiceRemoteAudioSink />
      <JoinKnockOverlay />
      <WorkspaceOverlay />
      <WorkspaceQuickMenu />
      {workspaceSwitching ? (
        <AppLoadingScreen connectionError={false} label="Loading workspace…" />
      ) : null}
      <div
        className={clsx(
          "app-layout",
          chatPanelOpen && "app-layout--chat-open",
          isMobileLayout && "app-layout--mobile",
          chatFullscreenOverlay && "app-layout--chat-fullscreen-overlay",
          panelOnLeft ? "app-layout--panel-left" : "app-layout--panel-right",
          settingsOpen && "app-layout--settings",
          !settingsOpen && inVoiceCall && "app-layout--voice-call",
        )}
        style={layoutStyle}
      >
        {!settingsOpen && !inVoiceCall && <AppChromeRow />}
        <main className="app-layout__main">
          {!settingsOpen && inVoiceCall ? (
            <div className="app-voice-settings-floating">
              <PanelToolbarButtons />
            </div>
          ) : null}
          {settingsOpen ? <SettingsPage /> : <CallsView />}
          {settingsOpen && inVoiceCall ? <ChatFullscreenMediaPip placement="settings" /> : null}
        </main>
        {!settingsOpen && <BottomHeader />}
        {chatPanelOpen && <ChatPanelShell key={sidePanelSide} />}
      </div>
    </div>
  );
}
