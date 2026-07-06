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
  seedMarketingPreview,
  seedMarketingRecordingPreview,
  seedMarketingTheaterPreview,
} from "./lib/marketingPreviewSeed";
import { applyDocumentTheme, bootstrapDocumentTheme } from "./lib/theme";
import { bootstrapDocumentAccentColor } from "./lib/accentColor";
import "./index.css";

markMarketingPreview();
applyMarketingPreviewThemeFromUrl();
bootstrapDocumentTheme();
bootstrapDocumentAccentColor();

const scene = readMarketingPreviewSceneParam();
if (scene === "recording") {
  seedMarketingRecordingPreview();
} else if (scene === "theater") {
  seedMarketingTheaterPreview();
} else {
  seedMarketingPreview();
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
