import React from "react";
import ReactDOM from "react-dom/client";
import MarketingConnectorsPreviewApp from "./MarketingConnectorsPreviewApp";
import MarketingPreviewApp from "./MarketingPreviewApp";
import MarketingRecordingPreviewApp from "./MarketingRecordingPreviewApp";
import {
  applyMarketingPreviewThemeFromUrl,
  markMarketingPreview,
  readMarketingPreviewSceneParam,
} from "./lib/marketingPreview";
import {
  seedMarketingPreview,
  seedMarketingRecordingPreview,
} from "./lib/marketingPreviewSeed";
import { applyDocumentTheme, bootstrapDocumentTheme, resolveEffectiveTheme } from "./lib/theme";
import { useStore } from "./store/useStore";
import "./index.css";

markMarketingPreview();
applyMarketingPreviewThemeFromUrl();
bootstrapDocumentTheme();

const scene = readMarketingPreviewSceneParam();
if (scene === "recording") {
  seedMarketingRecordingPreview();
} else {
  seedMarketingPreview();
}

applyDocumentTheme(resolveEffectiveTheme(useStore.getState().colorTheme));

const PreviewRoot =
  scene === "connectors"
    ? MarketingConnectorsPreviewApp
    : scene === "recording"
      ? MarketingRecordingPreviewApp
      : MarketingPreviewApp;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreviewRoot />
  </React.StrictMode>,
);
