import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { getLandingUrl } from "../../lib/appAccess";
import { APP_DISPLAY_NAME, APP_TAGLINE } from "../../lib/appBrand";
import { hasFormaDesktop } from "../../lib/formaDesktop";

const SITE_URL = "https://meetra.cc";

export default function AuthPage() {
  const signInWithProvider = useAuthStore((s) => s.signInWithProvider);
  const reopenDesktopWebAuth = useAuthStore((s) => s.reopenDesktopWebAuth);
  const cancelDesktopWebAuth = useAuthStore((s) => s.cancelDesktopWebAuth);
  const desktopWebAuthPending = useAuthStore((s) => s.desktopWebAuthPending);
  const desktopWebAuthConnected = useAuthStore((s) => s.desktopWebAuthConnected);
  const authError = useAuthStore((s) => s.authError);
  const [busy, setBusy] = useState(false);
  const signInRef = useRef<HTMLButtonElement>(null);
  const isDesktop = hasFormaDesktop();
  const desktopConnected = isDesktop && desktopWebAuthConnected;
  const waitingForDesktopAuth = isDesktop && (desktopWebAuthPending || desktopWebAuthConnected);

  useLayoutEffect(() => {
    const node = signInRef.current;
    if (node && document.activeElement === node) {
      node.blur();
    }
  }, [waitingForDesktopAuth]);

  const handleSignIn = async () => {
    if (busy || desktopWebAuthPending) return;
    if (isDesktop) {
      await signInWithProvider("google");
      return;
    }
    setBusy(true);
    try {
      await signInWithProvider("google");
    } finally {
      setBusy(false);
    }
  };

  const title = (
    <h1 className="auth-page__title">
      {isDesktop ? (
        APP_DISPLAY_NAME
      ) : (
        <a
          className="auth-page__title-link"
          href={getLandingUrl()}
          aria-label={`Retour à la page d'accueil ${APP_DISPLAY_NAME}`}
        >
          {APP_DISPLAY_NAME}
        </a>
      )}
    </h1>
  );

  return (
    <div className={isDesktop ? "auth-page auth-page--desktop" : "auth-page"}>
      <main className="auth-page__main">
        <div className="auth-page__card">
          {title}
          <p className="auth-page__subtitle">{APP_TAGLINE}</p>

          {authError && <p className="auth-page__error">{authError}</p>}

          {waitingForDesktopAuth ? (
            <div className="auth-page__waiting">
              <div className="auth-page__waiting-status" role="status" aria-live="polite">
                {!desktopConnected && (
                  <div
                    className="app-loading-screen__spinner auth-page__waiting-spinner"
                    aria-hidden
                  />
                )}
                <span className="auth-page__waiting-copy">
                  {desktopConnected ? "You're connected" : "Continue in your browser"}
                </span>
              </div>
              {!desktopConnected && (
                <div className="auth-page__waiting-actions">
                  <button
                    type="button"
                    className="btn btn-ghost auth-page__reopen-btn"
                    onClick={() => void reopenDesktopWebAuth()}
                  >
                    Reopen link
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost auth-page__cancel-btn"
                    onClick={() => cancelDesktopWebAuth()}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              ref={signInRef}
              type="button"
              className="btn auth-page__signin-btn"
              autoFocus={false}
              disabled={busy}
              onClick={() => void handleSignIn()}
            >
              {busy ? "Signing in…" : "Sign in"}
              {!busy && (
                <ArrowRight className="auth-page__signin-icon" size={16} strokeWidth={2} aria-hidden />
              )}
            </button>
          )}
        </div>
      </main>

      <footer className="auth-page__footer">
        <a
          href={`${SITE_URL}/terms`}
          className="auth-page__legal-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms of Service
        </a>
        <span aria-hidden> and </span>
        <a
          href={`${SITE_URL}/privacy`}
          className="auth-page__legal-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          privacy policy
        </a>
      </footer>
    </div>
  );
}
