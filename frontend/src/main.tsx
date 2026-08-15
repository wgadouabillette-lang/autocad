import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { redirectToLandingIfNeeded } from "./lib/appAccess";
import { bootstrapDocumentTheme } from "./lib/theme";
import { bootstrapDocumentAccentColor } from "./lib/accentColor";
import "./index.css";

bootstrapDocumentTheme();
bootstrapDocumentAccentColor();

if (
  window.location.pathname === "/auth/desktop" ||
  window.location.pathname === "/auth/desktop/"
) {
  window.history.replaceState({}, document.title, "/");
}

if (redirectToLandingIfNeeded()) {
  // Mobile/tablet web visitors stay on the marketing site.
} else {
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    document.body.textContent = "Hall: #root introuvable.";
  } else {
    try {
      ReactDOM.createRoot(rootEl).render(
        <React.StrictMode>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </React.StrictMode>,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      rootEl.innerHTML = `<div style="font-family:system-ui;color:#e0e0e0;padding:2rem;line-height:1.5"><h1 style="margin:0 0 1rem">Hall</h1><p>L'interface n'a pas pu démarrer.</p><pre style="white-space:pre-wrap">${message}</pre></div>`;
    }
  }
}
