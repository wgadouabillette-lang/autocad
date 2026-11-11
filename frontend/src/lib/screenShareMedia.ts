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

/** Preflight OS screen-recording permission (desktop). Shared by share + recording. */
export async function ensureDesktopScreenCaptureAllowed(): Promise<void> {
  if (!hasFormaDesktop()) return;
  const info = await getScreenCaptureAccessInfo();
  if (!info) return;
  if (isScreenCaptureAccessDenied(info.status)) {
    void openScreenCaptureSettings();
    throw new Error(screenCaptureSettingsHint(info.platform));
  }
}

function screenCaptureConstraints(): MediaTrackConstraints {
  const scale = window.devicePixelRatio || 1;
  const width = Math.round(window.screen.width * scale);
  const height = Math.round(window.screen.height * scale);
  return {
    width: { ideal: width, max: width },
    height: { ideal: height, max: height },
    frameRate: { ideal: 30, max: 30 },
  };
}

function sharpenScreenTrack(stream: MediaStream) {
  const track = stream.getVideoTracks().find((item) => item.readyState === "live");
  if (!track) return;
  track.contentHint = "detail";
  const constraints = screenCaptureConstraints();
  void track.applyConstraints(constraints).catch(() => undefined);
}

export async function startScreenShare(): Promise<MediaStream> {
  requireMediaDevices();
  stopScreenShare();
  await ensureDesktopScreenCaptureAllowed();
  const video = screenCaptureConstraints();

  try {
    screenShareStream = await navigator.mediaDevices.getDisplayMedia({
      video,
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
          : "Autorisez l'enregistrement d'écran pour Meetra dans les réglages système.",
      );
    }
    // Some environments reject audio:true — fall back to video-only share.
    if (
      error instanceof DOMException &&
      (error.name === "NotSupportedError" || error.name === "TypeError")
    ) {
      screenShareStream = await navigator.mediaDevices.getDisplayMedia({
        video,
        audio: false,
      });
    } else {
      throw error;
    }
  }

  sharpenScreenTrack(screenShareStream);
  return screenShareStream;
}

export function stopScreenShare() {
  screenShareStream?.getTracks().forEach((track) => track.stop());
  screenShareStream = null;
}
