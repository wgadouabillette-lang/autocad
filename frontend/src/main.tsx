import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { redirectToLandingIfNeeded } from "./lib/appAccess";
import { bootstrapDocumentTheme } from "./lib/theme";
import "./index.css";

bootstrapDocumentTheme();

if (
  window.location.pathname === "/auth/desktop" ||
  window.location.pathname === "/auth/desktop/"
) {
  window.history.replaceState({}, document.title, "/");
}

if (redirectToLandingIfNeeded()) {
  // Mobile/tablet web visitors stay on the marketing site.
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
}
