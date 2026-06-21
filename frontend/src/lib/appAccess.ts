import { hasFormaDesktop } from "./formaDesktop";

export const DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";

export function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
}

/** Web app and auth are desktop-only unless running inside the native Lyte app. */
export function canAccessApp(): boolean {
  return hasFormaDesktop() || isDesktopViewport();
}

export function getLandingUrl(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:5190/";
  }
  return "/";
}

export function redirectToLandingIfNeeded(): boolean {
  if (canAccessApp()) return false;
  window.location.replace(getLandingUrl());
  return true;
}
