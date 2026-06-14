import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import "./index.css";

if (
  window.location.pathname === "/auth/desktop" ||
  window.location.pathname === "/auth/desktop/"
) {
  window.history.replaceState({}, document.title, "/");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
