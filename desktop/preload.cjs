const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, handler) {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// The bridge has to be installed before anything else in this file. If this
// script throws first, the page never receives formaDesktop and the splash
// window stays up. scripts/check-desktop-boot.cjs rejects that order.
function exposeDesktopBridge(api) {
  contextBridge.exposeInMainWorld("formaDesktop", api);
}

const desktopBridge = {
  isDesktop: true,
  platform: process.platform,
  setWindowMode: (mode) => ipcRenderer.invoke("forma:set-window-mode", mode),
  getWindowState: () => ipcRenderer.invoke("forma:window-get-state"),
  windowMinimize: () => ipcRenderer.invoke("forma:window-minimize"),
  windowToggleFullscreen: () => ipcRenderer.invoke("forma:window-toggle-fullscreen"),
  windowClose: () => ipcRenderer.invoke("forma:window-close"),
  onWindowState: (handler) => subscribe("forma:window-state", handler),
  openExternal: (url) => ipcRenderer.invoke("forma:open-external", url),
  openConnectorOAuth: (url) => ipcRenderer.invoke("forma:open-connector-oauth", url),
  getAppWindowSourceId: () => ipcRenderer.invoke("forma:get-app-window-source-id"),
  getPreferredScreenSourceId: () =>
    ipcRenderer.invoke("forma:get-preferred-screen-source-id"),
  showRecordingCameraOverlay: (opts) =>
    ipcRenderer.invoke("forma:show-recording-camera-overlay", opts ?? {}),
  hideRecordingCameraOverlay: () => ipcRenderer.invoke("forma:hide-recording-camera-overlay"),
  updateRecordingCameraOverlay: (opts) =>
    ipcRenderer.invoke("forma:update-recording-camera-overlay", opts ?? {}),
  getScreenCaptureAccessStatus: () =>
    ipcRenderer.invoke("forma:get-screen-capture-access-status"),
  openScreenCaptureSettings: () => ipcRenderer.invoke("forma:open-screen-capture-settings"),
  installUpdateNow: () => ipcRenderer.invoke("forma:update-install-now"),
  scheduleUpdateTonight: () => ipcRenderer.invoke("forma:update-schedule-tonight"),
  getUpdateState: () => ipcRenderer.invoke("forma:update-get-state"),
  triggerMockUpdate: () => ipcRenderer.invoke("forma:update-trigger-mock"),
  onUpdateAvailable: (handler) => subscribe("forma:update-available", handler),
  onUpdateScheduledTonight: (handler) =>
    subscribe("forma:update-scheduled-tonight", handler),
  onUpdateProgress: (handler) => subscribe("forma:update-progress", handler),
  onUpdateInstalled: (handler) => subscribe("forma:update-installed", handler),
  getSpotifyWebView2Availability: () => ipcRenderer.invoke("forma:spotify-webview2-availability"),
  warmSpotifyWebView2: () => ipcRenderer.invoke("forma:spotify-webview2-warm"),
  playSpotifyWebView2: (trackId) => ipcRenderer.invoke("forma:spotify-webview2-play", trackId),
  pauseSpotifyWebView2: () => ipcRenderer.invoke("forma:spotify-webview2-pause"),
  resumeSpotifyWebView2: () => ipcRenderer.invoke("forma:spotify-webview2-resume"),
  toggleSpotifyWebView2: () => ipcRenderer.invoke("forma:spotify-webview2-toggle"),
  setSpotifyWebView2Volume: (volume) =>
    ipcRenderer.invoke("forma:spotify-webview2-set-volume", volume),
  resetSpotifyWebView2: () => ipcRenderer.invoke("forma:spotify-webview2-reset"),
  getSpotifyWebView2PlaybackClock: () =>
    ipcRenderer.invoke("forma:spotify-webview2-playback-clock"),
  respondSpotifyToken: (payload) => ipcRenderer.invoke("forma:spotify-token-response", payload),
  onSpotifyTokenRequest: (handler) => subscribe("forma:spotify-token-request", handler),
  onSpotifyPlaybackState: (handler) => subscribe("forma:spotify-playback-state", handler),
  onSpotifyPlaybackEnded: (handler) => subscribe("forma:spotify-playback-ended", handler),
  getSpotifyWidevineStatus: () => ipcRenderer.invoke("forma:spotify-widevine-status"),
  writeClipboardText: (text) => ipcRenderer.invoke("forma:clipboard-write-text", text),
  saveNotePdf: (payload) => ipcRenderer.invoke("forma:save-note-pdf", payload),
  getPendingWorkspaceInvite: () => ipcRenderer.invoke("forma:get-pending-workspace-invite"),
  onWorkspaceInvite: (handler) => subscribe("forma:workspace-invite", handler),
  onConnectorOAuthResult: (handler) => subscribe("forma:connector-oauth-result", handler),
};

try {
  exposeDesktopBridge(desktopBridge);
} catch {
  try {
    exposeDesktopBridge({
      isDesktop: true,
      platform: process.platform,
      setWindowMode: (mode) => ipcRenderer.invoke("forma:set-window-mode", mode),
      windowClose: () => ipcRenderer.invoke("forma:window-close"),
    });
  } catch {
    // The main-process launch watchdog still opens the window.
  }
}

if (process.platform === "win32") {
  const markWindowsChrome = () => {
    const root = document.documentElement;
    if (!root) return;
    root.classList.add("is-desktop-windows", "has-desktop-autohide-titlebar");
  };
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", markWindowsChrome, { once: true });
    } else {
      markWindowsChrome();
    }
  } catch {
    // The bridge above must stay available even if the document is not ready.
  }
}
