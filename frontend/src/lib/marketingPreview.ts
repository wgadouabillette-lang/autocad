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

export function readMarketingPreviewThemeParam(): "light" | "dark" {
  const raw = new URLSearchParams(window.location.search).get("theme");
  return raw === "light" ? "light" : "dark";
}

export function applyMarketingPreviewThemeFromUrl(): void {
  const theme = readMarketingPreviewThemeParam();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
