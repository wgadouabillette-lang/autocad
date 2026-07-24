declare global {
  interface Window {
    __LYTE_MARKETING_PREVIEW__?: boolean;
  }
}

export const MARKETING_PREVIEW_WORKSPACE_ID = "preview-workspace";
export const MARKETING_PREVIEW_USER_ID = "preview-user";
export const MARKETING_PREVIEW_NOTE_ID = "preview-note-main";

/** Compact landing → preview iframe navigation commands. */
export const MARKETING_PREVIEW_NAV_MESSAGE = "lyte-marketing-preview-nav";

export type MarketingPreviewNavAction =
  | "show-dashboard"
  | "open-connectors"
  | "open-skills"
  | "play-music";

/** Frozen Spotify progress shown in the marketing dashboard preview. */
export const MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC = 32;

/** After Hours album art for Blinding Lights (The Weeknd). */
export const MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL =
  "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6f/bc/e6/6fbce6c4-c38c-72d8-4fd0-66cfff32f679/20UMGIM12176.rgb.jpg/600x600bb.jpg";

export function markMarketingPreview(): void {
  window.__LYTE_MARKETING_PREVIEW__ = true;
}

export function isMarketingPreview(): boolean {
  return window.__LYTE_MARKETING_PREVIEW__ === true;
}

export function parseMarketingPreviewNavAction(data: unknown): MarketingPreviewNavAction | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { type?: unknown; action?: unknown };
  if (payload.type !== MARKETING_PREVIEW_NAV_MESSAGE) return null;
  if (
    payload.action === "show-dashboard" ||
    payload.action === "open-connectors" ||
    payload.action === "open-skills" ||
    payload.action === "play-music"
  ) {
    return payload.action;
  }
  return null;
}

/** Drop `/play` demo turns so switching compact nav sections replaces the previous demo. */
export function isMarketingPlayDemoMessage(message: {
  role?: string;
  text?: string;
  source?: string;
  spotifySearch?: unknown[];
}): boolean {
  if (message.role === "user" && typeof message.text === "string") {
    return /^\/play\b/i.test(message.text.trim());
  }
  if (message.role !== "assistant") return false;
  if (Array.isArray(message.spotifySearch) && message.spotifySearch.length > 0) return true;
  return message.source === "play-skill" || message.source === "play-prompt";
}

export function stripMarketingPlayDemoMessages<T extends {
  role?: string;
  text?: string;
  source?: string;
  spotifySearch?: unknown[];
}>(chat: T[]): T[] {
  return chat.filter((message) => !isMarketingPlayDemoMessage(message));
}

export type MarketingPreviewScene = "dashboard" | "connectors" | "recording" | "theater";

export function readMarketingPreviewSceneParam(): MarketingPreviewScene {
  const raw = new URLSearchParams(window.location.search).get("scene");
  if (raw === "connectors") return "connectors";
  if (raw === "recording") return "recording";
  if (raw === "theater") return "theater";
  return "dashboard";
}

export function isMarketingRecordingPreviewScene(): boolean {
  return isMarketingPreview() && readMarketingPreviewSceneParam() === "recording";
}

/** Static recording preview (yellow frame already on, no demo animation). */
export function readMarketingPreviewRecordingActiveParam(): boolean {
  return new URLSearchParams(window.location.search).get("recordingActive") === "1";
}

/** Static connectors preview (list open, no cascade animation). */
export function readMarketingPreviewConnectorsActiveParam(): boolean {
  return new URLSearchParams(window.location.search).get("connectorsActive") === "1";
}

export function isMarketingTheaterPreviewScene(): boolean {
  return isMarketingPreview() && readMarketingPreviewSceneParam() === "theater";
}

export function applyMarketingPreviewThemeFromUrl(): void {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}
