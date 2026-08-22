import { APP_DISPLAY_NAME, APP_TAGLINE } from "../lib/appBrand";

type AppLoadingScreenProps = {
  connectionError?: boolean;
  label?: string;
  /** 0–100 when known (desktop update). Omit for an indeterminate boot bar. */
  progress?: number | null;
  onRetry?: () => void;
};

export default function AppLoadingScreen({
  connectionError = false,
  label = "Loading…",
  progress = null,
  onRetry,
}: AppLoadingScreenProps) {
  const determinate = !connectionError && progress != null;
  const percent = determinate ? Math.max(0, Math.min(100, progress)) : 0;

  return (
    <div className="app-loading-screen" role={connectionError ? "alert" : "status"}>
      <div className="app-loading-screen__window">
        <div className="app-loading-screen__card">
          <h1 className="app-loading-screen__title">{APP_DISPLAY_NAME}</h1>
          <p className="app-loading-screen__subtitle">{APP_TAGLINE}</p>
          {!connectionError ? (
            <div
              className={
                determinate
                  ? "app-loading-screen__progress"
                  : "app-loading-screen__progress app-loading-screen__progress--indeterminate"
              }
              role="progressbar"
              aria-label={label}
              aria-busy={percent < 100}
              aria-valuemin={determinate ? 0 : undefined}
              aria-valuemax={determinate ? 100 : undefined}
              aria-valuenow={determinate ? Math.round(percent) : undefined}
            >
              <div
                className="app-loading-screen__progress-fill"
                style={determinate ? { width: `${percent}%` } : undefined}
              />
            </div>
          ) : null}
          {connectionError ? (
            <div className="app-loading-screen__error">
              <p className="app-loading-screen__error-title">Connection failed</p>
              <p className="app-loading-screen__error-body">
                Check your internet connection, then try again.
              </p>
              {onRetry ? (
                <button type="button" className="app-loading-screen__retry" onClick={onRetry}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
