import {
  hasFormaDesktop,
  type DesktopPlatform,
  type ScreenCaptureAccessInfo,
  type ScreenCaptureAccessStatus,
} from "./formaDesktop";

export function isScreenCaptureAccessDenied(status: ScreenCaptureAccessStatus): boolean {
  return status === "denied" || status === "restricted";
}

export async function isFormaDesktopBridgeReady(): Promise<boolean> {
  if (!hasFormaDesktop() || !window.formaDesktop?.getScreenCaptureAccessStatus) {
    return false;
  }
  try {
    await window.formaDesktop.getScreenCaptureAccessStatus();
    return true;
  } catch {
    return false;
  }
}

export async function getScreenCaptureAccessInfo(): Promise<ScreenCaptureAccessInfo | null> {
  if (!hasFormaDesktop() || !window.formaDesktop?.getScreenCaptureAccessStatus) {
    return null;
  }
  try {
    return await window.formaDesktop.getScreenCaptureAccessStatus();
  } catch {
    return null;
  }
}

export async function openScreenCaptureSettings(): Promise<boolean> {
  if (!hasFormaDesktop() || !window.formaDesktop?.openScreenCaptureSettings) {
    return false;
  }
  return window.formaDesktop.openScreenCaptureSettings();
}

export function isScreenCapturePermissionError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "PermissionDeniedError";
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("permission") ||
      message.includes("not allowed") ||
      message.includes("access denied") ||
      message.includes("enregistrement d'écran") ||
      message.includes("screen capture") ||
      message.includes("screen recording") ||
      message.includes("introuvable") ||
      message.includes("arrêtée immédiatement")
    );
  }
  return false;
}

export function screenCaptureSettingsHint(platform: DesktopPlatform | string): string {
  if (platform === "darwin") {
    return "Ouvrez Réglages système → Confidentialité et sécurité → Enregistrement de l'écran, puis activez Hall. En développement, autorisez aussi Electron si Hall n'apparaît pas.";
  }
  if (platform === "win32") {
    return "Ouvrez Paramètres → Confidentialité → Enregistrement d'écran, puis autorisez Hall ou Electron.";
  }
  return "Autorisez l'enregistrement d'écran pour Hall dans les réglages de confidentialité de votre système.";
}
