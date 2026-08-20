import { hasFormaDesktop } from "./formaDesktop";

export const DESKTOP_VIEWPORT_QUERY = "(min-width: 768px)";
const DESKTOP_LOOPBACK_PORTS = new Set(["47831", "47832"]);

export function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;
}

/** Packaged Meetra serves the UI from the embedded desktop server on loopback. */
export function isLocalDesktopBackend(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, port } = window.location;
  const loopback = hostname === "127.0.0.1" || hostname === "localhost";
  return loopback && DESKTOP_LOOPBACK_PORTS.has(port);
}

/** Web app and auth are desktop-only unless running inside the native Meetra app. */
export function canAccessApp(): boolean {
  return hasFormaDesktop() || isLocalDesktopBackend() || isDesktopViewport();
}

export function getLandingUrl(): string {
  if (hasFormaDesktop() || isLocalDesktopBackend()) {
    return "/app/";
  }
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
