type AppLoadingScreenProps = {
  connectionError?: boolean;
  label?: string;
  onRetry?: () => void;
};

export default function AppLoadingScreen({
  connectionError = false,
  label = "Chargement…",
  onRetry,
}: AppLoadingScreenProps) {
  return (
    <div className="app-loading-screen" role={connectionError ? "alert" : "status"}>
      <div className="app-loading-screen__center">
        <div className="app-loading-screen__brand">
          <span className="app-loading-screen__brand-mark" aria-hidden>
            Lyte
          </span>
          <span className="sr-only">Lyte</span>
        </div>
        {!connectionError ? (
          <div
            className="app-loading-screen__bar"
            role="progressbar"
            aria-label={label}
            aria-busy="true"
          >
            <span className="app-loading-screen__bar-fill" aria-hidden />
          </div>
        ) : null}
        {connectionError ? (
          <div className="app-loading-screen__error">
            <p className="app-loading-screen__error-title">Connexion impossible</p>
            <p className="app-loading-screen__error-body">
              Vérifiez votre connexion internet, puis réessayez.
            </p>
            {onRetry ? (
              <button type="button" className="app-loading-screen__retry" onClick={onRetry}>
                Réessayer
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <footer className="app-loading-screen__footer">
        <span>Powered by GB Studio</span>
      </footer>
    </div>
  );
}
