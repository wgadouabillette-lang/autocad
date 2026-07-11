import { hasFormaDesktop } from "./formaDesktop";
import {
  getScreenCaptureAccessInfo,
  isScreenCaptureAccessDenied,
  isScreenCapturePermissionError,
  openScreenCaptureSettings,
  screenCaptureSettingsHint,
} from "./screenCapturePermission";

let screenShareStream: MediaStream | null = null;

function requireMediaDevices() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Le partage d'écran n'est pas disponible dans ce navigateur.");
  }
}

export function getScreenShareStream(): MediaStream | null {
  return screenShareStream;
}

async function ensureDesktopScreenCaptureAllowed(): Promise<void> {
  if (!hasFormaDesktop()) return;
  const info = await getScreenCaptureAccessInfo();
  if (!info) return;
  if (isScreenCaptureAccessDenied(info.status)) {
    void openScreenCaptureSettings();
    throw new Error(screenCaptureSettingsHint(info.platform));
  }
}

export async function startScreenShare(): Promise<MediaStream> {
  requireMediaDevices();
  stopScreenShare();
  await ensureDesktopScreenCaptureAllowed();

  try {
    screenShareStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      // System / tab audio when the OS / picker allows it (Electron loopback, Chrome checkbox).
      audio: true,
    });
  } catch (error) {
    if (hasFormaDesktop() && isScreenCapturePermissionError(error)) {
      void openScreenCaptureSettings();
      const info = await getScreenCaptureAccessInfo();
      throw new Error(
        info
          ? screenCaptureSettingsHint(info.platform)
          : "Autorisez l'enregistrement d'écran pour Hall dans les réglages système.",
      );
    }
    // Some environments reject audio:true — fall back to video-only share.
    if (
      error instanceof DOMException &&
      (error.name === "NotSupportedError" || error.name === "TypeError")
    ) {
      screenShareStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } else {
      throw error;
    }
  }

  return screenShareStream;
}

export function stopScreenShare() {
  screenShareStream?.getTracks().forEach((track) => track.stop());
  screenShareStream = null;
}
