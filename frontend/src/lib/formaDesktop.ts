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
}

export function hasFormaDesktop(): boolean {
  return window.formaDesktop?.isDesktop === true;
}
