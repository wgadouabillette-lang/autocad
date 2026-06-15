import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugLog } from "../lib/debugLog";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Forma render error", error, info.componentStack);
    debugLog(
      "AppErrorBoundary.tsx:componentDidCatch",
      "React error caught",
      {
        errorMessage: error.message,
        componentStack: info.componentStack?.slice(0, 500) ?? null,
      },
      "ALL",
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app-error-screen" role="alert">
        <div className="app-error-screen__card">
          <h1 className="app-error-screen__title">Une erreur est survenue</h1>
          <p className="app-error-screen__body">
            L&apos;interface n&apos;a pas pu s&apos;afficher. Rechargez la page ; si le problème
            persiste, videz le cache du navigateur.
          </p>
          <pre className="app-error-screen__detail">{this.state.error.message}</pre>
          <button
            type="button"
            className="app-error-screen__retry"
            onClick={() => window.location.reload()}
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
