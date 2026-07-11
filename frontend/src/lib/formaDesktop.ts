export type ScreenCaptureAccessStatus =
  | "not-determined"
  | "granted"
  | "denied"
  | "restricted"
  | "unknown";

export type DesktopPlatform = "darwin" | "win32" | "linux" | "aix" | "freebsd" | "openbsd" | "sunos";

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

export interface FormaDesktopBridge {
  isDesktop: true;
  platform: DesktopPlatform | string;
  openExternal: (url: string) => Promise<void>;
  getAppWindowSourceId: () => Promise<string | null>;
  getScreenCaptureAccessStatus: () => Promise<ScreenCaptureAccessInfo>;
  openScreenCaptureSettings: () => Promise<boolean>;
  installUpdateNow?: () => Promise<{ ok: boolean; reason?: string; dev?: boolean }>;
  scheduleUpdateTonight?: () => Promise<{ ok: boolean; reason?: string }>;
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
  resetSpotifyWebView2?: () => Promise<void>;
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
