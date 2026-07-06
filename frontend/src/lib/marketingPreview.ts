declare global {
  interface Window {
    __LYTE_MARKETING_PREVIEW__?: boolean;
  }
}

export const MARKETING_PREVIEW_WORKSPACE_ID = "preview-workspace";
export const MARKETING_PREVIEW_USER_ID = "preview-user";
export const MARKETING_PREVIEW_NOTE_ID = "preview-note-main";

export function markMarketingPreview(): void {
  window.__LYTE_MARKETING_PREVIEW__ = true;
}

export function isMarketingPreview(): boolean {
  return window.__LYTE_MARKETING_PREVIEW__ === true;
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

export function isMarketingTheaterPreviewScene(): boolean {
  return isMarketingPreview() && readMarketingPreviewSceneParam() === "theater";
}

export function applyMarketingPreviewThemeFromUrl(): void {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
}
