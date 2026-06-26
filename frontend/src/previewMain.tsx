import React from "react";
import ReactDOM from "react-dom/client";
import MarketingPreviewApp from "./MarketingPreviewApp";
import {
  applyMarketingPreviewThemeFromUrl,
  markMarketingPreview,
} from "./lib/marketingPreview";
import { seedMarketingPreview } from "./lib/marketingPreviewSeed";
import { applyDocumentTheme, bootstrapDocumentTheme, resolveEffectiveTheme } from "./lib/theme";
import { useStore } from "./store/useStore";
import "./index.css";

markMarketingPreview();
applyMarketingPreviewThemeFromUrl();
bootstrapDocumentTheme();
seedMarketingPreview();
applyDocumentTheme(resolveEffectiveTheme(useStore.getState().colorTheme));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MarketingPreviewApp />
  </React.StrictMode>,
);
