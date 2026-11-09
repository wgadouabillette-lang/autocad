import React from "react";
import ReactDOM from "react-dom/client";
import MarketingConnectorsPreviewApp from "./MarketingConnectorsPreviewApp";
import MarketingPreviewApp from "./MarketingPreviewApp";
import MarketingRecordingPreviewApp from "./MarketingRecordingPreviewApp";
import MarketingTheaterPreviewApp from "./MarketingTheaterPreviewApp";
import {
  applyMarketingPreviewThemeFromUrl,
  markMarketingPreview,
  readMarketingPreviewSceneParam,
} from "./lib/marketingPreview";
import {
  seedMarketingHandoffPreview,
  seedMarketingLandingHero,
  seedMarketingNotesPreview,
  seedMarketingPreview,
  seedMarketingHome,
  seedMarketingRecordingPreview,
  seedMarketingSpotifyPreview,
  seedMarketingTheaterPreview,
} from "./lib/marketingPreviewSeed";
import { applyDocumentTheme, bootstrapDocumentTheme } from "./lib/theme";
import { bootstrapDocumentAccentColor } from "./lib/accentColor";
import { applyAppLocale } from "./lib/i18n";
import "./index.css";

function applyMarketingPreviewDesktopChrome(): void {
  const params = new URLSearchParams(window.location.search);
  const chrome = params.get("chrome");
  const root = document.documentElement;
  if (chrome === "mac") {
    root.classList.add("has-desktop-mac-traffic-lights", "has-desktop-autohide-titlebar");
    if (params.get("fullscreen") === "1") {
      root.classList.add("is-desktop-mac-fullscreen");
    }
    window.formaDesktop = {
      isDesktop: true,
      platform: "darwin",
    } as NonNullable<Window["formaDesktop"]>;
    return;
  }
  if (chrome !== "windows") return;
  const maximized = params.get("maximized") === "1";
  root.classList.add("is-desktop-windows", "has-desktop-autohide-titlebar");
  if (maximized) root.classList.add("is-desktop-windows-maximized");
  const state = { maximized, fullScreen: false };
  window.formaDesktop = {
    isDesktop: true,
    platform: "win32",
    getWindowState: async () => state,
    onWindowState: () => () => undefined,
    windowMinimize: async () => ({ ok: true, ...state }),
    windowToggleFullscreen: async () => ({ ok: true, ...state }),
    windowClose: async () => ({ ok: true }),
  } as NonNullable<Window["formaDesktop"]>;
}

markMarketingPreview();
applyAppLocale("en");
applyMarketingPreviewDesktopChrome();
applyMarketingPreviewThemeFromUrl();
bootstrapDocumentTheme();
bootstrapDocumentAccentColor();

const scene = readMarketingPreviewSceneParam();
if (scene === "home") {
  seedMarketingHome();
} else if (scene === "recording") {
  seedMarketingRecordingPreview();
} else if (scene === "theater") {
  seedMarketingTheaterPreview();
} else if (scene === "notes") {
  seedMarketingNotesPreview();
} else if (scene === "handoff") {
  seedMarketingHandoffPreview();
} else if (scene === "spotify") {
  seedMarketingSpotifyPreview();
} else {
  seedMarketingLandingHero();
}

applyDocumentTheme();

const PreviewRoot =
  scene === "connectors"
    ? MarketingConnectorsPreviewApp
    : scene === "recording"
      ? MarketingRecordingPreviewApp
      : scene === "theater"
        ? MarketingTheaterPreviewApp
        : MarketingPreviewApp;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewRoot />
  </React.StrictMode>,
);
