export type ScreenCaptureAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

export type DesktopPlatform = "darwin" | "win32" | "linux" | "aix" | "freebsd" | "openbsd" | "sunos";

export type DesktopWindowMode = "splash" | "app";

export interface ScreenCaptureAccessInfo {
  status: ScreenCaptureAccessStatus;
  platform: DesktopPlatform | string;
}

export interface DesktopUpdateInfo {
  version: string;
  releaseNotes?: string;
  currentVersion?: string;
}

export interface DesktopUpdateProgress {
  percent: number;
  version: string;
}

export interface DesktopUpdateState {
  available: DesktopUpdateInfo | null;
  pendingTonight: { version: string; releaseNotes?: string; schedule: string } | null;
  installing: boolean;
  nightWindow: string;
  isNightWindow: boolean;
  startupCheckComplete?: boolean;
  progress?: DesktopUpdateProgress | null;
}

export interface DesktopUpdateScheduledTonight {
  version: string;
  window: string;
}

export interface SpotifyWebView2Availability {
  supported: boolean;
  ready: boolean;
}

export interface SpotifyTokenRequest {
  id: string;
}

export interface SpotifyPlaybackStateEvent {
  playing: boolean;
}

export interface DesktopWindowState {
  mode?: DesktopWindowMode;
  maximized: boolean;
  fullScreen: boolean;
}

export interface FormaDesktopBridge {
  isDesktop: true;
  platform: DesktopPlatform | string;
  setWindowMode?: (mode: DesktopWindowMode) => Promise<{ ok: boolean; mode?: DesktopWindowMode }>;
  getWindowState?: () => Promise<DesktopWindowState>;
  windowMinimize?: () => Promise<{ ok: boolean } & Partial<DesktopWindowState>>;
  windowToggleFullscreen?: () => Promise<{ ok: boolean } & Partial<DesktopWindowState>>;
  windowClose?: () => Promise<{ ok: boolean }>;
  onWindowState?: (handler: (state: DesktopWindowState) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  getAppWindowSourceId: () => Promise<string | null>;
  getPreferredScreenSourceId?: () => Promise<string | null>;
  showRecordingCameraOverlay?: (opts?: { mirror?: boolean }) => Promise<boolean>;
  hideRecordingCameraOverlay?: () => Promise<boolean>;
  updateRecordingCameraOverlay?: (opts?: { mirror?: boolean }) => Promise<boolean>;
  getScreenCaptureAccessStatus: () => Promise<ScreenCaptureAccessInfo>;
  openScreenCaptureSettings: () => Promise<boolean>;
  installUpdateNow?: () => Promise<{ ok: boolean; reason?: string; dev?: boolean }>;
  scheduleUpdateTonight?: () => Promise<{ ok: boolean; reason?: string }>;
  getUpdateState?: () => Promise<DesktopUpdateState>;
  triggerMockUpdate?: () => Promise<{ ok: boolean }>;
  onUpdateAvailable?: (handler: (info: DesktopUpdateInfo) => void) => () => void;
  onUpdateScheduledTonight?: (
    handler: (info: DesktopUpdateScheduledTonight) => void,
  ) => () => void;
  onUpdateProgress?: (handler: (progress: DesktopUpdateProgress) => void) => () => void;
  onUpdateInstalled?: (handler: (info: { version: string; dev?: boolean }) => void) => () => void;
  /** Windows : lecteur Spotify via WebView2 (Widevine Edge). */
  getSpotifyWebView2Availability?: () => Promise<SpotifyWebView2Availability>;
  warmSpotifyWebView2?: () => Promise<void>;
  playSpotifyWebView2?: (trackId: string) => Promise<boolean>;
  pauseSpotifyWebView2?: () => Promise<void>;
  resumeSpotifyWebView2?: () => Promise<void>;
  toggleSpotifyWebView2?: () => Promise<void>;
  setSpotifyWebView2Volume?: (volume: number) => Promise<void>;
  resetSpotifyWebView2?: () => Promise<void>;
  getSpotifyWebView2PlaybackClock?: () => Promise<{
    sec: number | null;
    durationSec: number | null;
  }>;
  respondSpotifyToken?: (payload: { id: string; token: string }) => Promise<void>;
  onSpotifyTokenRequest?: (handler: (request: SpotifyTokenRequest) => void) => () => void;
  onSpotifyPlaybackState?: (handler: (state: SpotifyPlaybackStateEvent) => void) => () => void;
  onSpotifyPlaybackEnded?: (handler: () => void) => () => void;
  /** macOS : statut Widevine CDM (Electron Castlabs). */
  getSpotifyWidevineStatus?: () => Promise<Record<string, unknown>>;
}

export function hasFormaDesktop(): boolean {
  return window.formaDesktop?.isDesktop === true;
}

export function hasSpotifyWebView2Desktop(): boolean {
  return hasFormaDesktop() && window.formaDesktop?.platform === "win32";
}

export function hasSpotifyWidevineDesktop(): boolean {
  return hasFormaDesktop() && window.formaDesktop?.platform === "darwin";
}
