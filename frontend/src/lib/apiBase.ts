import { hasFormaDesktop } from "./formaDesktop";

const PROD_API_ORIGIN = "https://meetra.cc";

/**
 * Origin for FastAPI (connectors, billing, desktop-auth claim).
 *
 * Packaged Electron serves the UI from 127.0.0.1:47832 and used to proxy
 * `/api` to a local Python backend. That backend often cannot verify Firebase
 * ID tokens (missing CA bundle / inherited ADC), so plugins and payments
 * return 401 after a successful Google handoff. Production desktop must talk
 * to the deployed API.
 */
export function apiOrigin(): string {
  const configured = import.meta.env.VITE_FORMA_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (import.meta.env.PROD && hasFormaDesktop()) {
    return PROD_API_ORIGIN;
  }
  return "";
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = apiOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}
