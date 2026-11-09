import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/useAuthStore";
import { getLandingUrl } from "../../lib/appAccess";
import { APP_DISPLAY_NAME } from "../../lib/appBrand";
import { hasFormaDesktop } from "../../lib/formaDesktop";

const SITE_URL = "https://meetra.cc";

type AuthPageProps = {
  phase?: "loading" | "signin";
  label?: string;
  progress?: number | null;
  connectionError?: boolean;
  onRetry?: () => void;
};

export default function AuthPage({
  phase = "signin",
  label = "Loading…",
  progress = null,
  connectionError = false,
  onRetry,
}: AuthPageProps) {
  const signInWithProvider = useAuthStore((s) => s.signInWithProvider);
  const reopenDesktopWebAuth = useAuthStore((s) => s.reopenDesktopWebAuth);
  const cancelDesktopWebAuth = useAuthStore((s) => s.cancelDesktopWebAuth);
  const desktopWebAuthPending = useAuthStore((s) => s.desktopWebAuthPending);
  const desktopWebAuthConnected = useAuthStore((s) => s.desktopWebAuthConnected);
  const authError = useAuthStore((s) => s.authError);
  const { t } = useTranslation();
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

  const determinate = !connectionError && progress != null;
  const percent = determinate ? Math.max(0, Math.min(100, progress)) : 0;
  const showSignIn = phase === "signin";

  return (
    <div className="seat-gate" role="dialog" aria-modal="true" aria-labelledby="auth-gate-title">
      <div className="seat-gate__backdrop" />
      <div
        className={
          showSignIn
            ? "seat-gate__card seat-gate__card--choose seat-gate__card--welcome"
            : "seat-gate__card seat-gate__card--choose"
        }
      >
        {showSignIn ? null : <div className="seat-gate__media" aria-hidden="true" />}
        <div className="seat-gate__pane">
          <div className="seat-gate__body seat-gate__body--flow">
            {showSignIn ? (
              <>
              <div className="seat-gate__survey seat-gate__survey--welcome">
                <div className="seat-gate__pay-head seat-gate__pay-head--stack">
                  <div className="seat-gate__brand" aria-label={APP_DISPLAY_NAME}>
                    <img
                      src={`${import.meta.env.BASE_URL}meetra-mark.svg`}
                      alt=""
                      className="app-chrome-row__brand-logo"
                      draggable={false}
                    />
                  </div>
                  <h1 id="auth-gate-title" className="seat-gate__title seat-gate__title--wrap">
                    {t("onboarding.welcomeTitle")}
                  </h1>
                  <p className="seat-gate__subtitle">{t("onboarding.welcomeSubtitle")}</p>
                </div>
                {authError ? <p className="seat-gate__error">{authError}</p> : null}
                {waitingForDesktopAuth ? (
                  <div className="auth-page__waiting">
                    <div className="auth-page__waiting-status" role="status" aria-live="polite">
                      {!desktopConnected && (
                        <div className="app-loading-screen__spinner auth-page__waiting-spinner" aria-hidden />
                      )}
                      <span className="auth-page__waiting-copy">
                        {desktopConnected ? "You're connected" : "Continue in your browser"}
                      </span>
                    </div>
                    {!desktopConnected && (
                      <div className="auth-page__waiting-actions">
                        <button
                          type="button"
                          className="seat-gate__text-btn"
                          onClick={() => void reopenDesktopWebAuth()}
                        >
                          Reopen link
                        </button>
                        <button
                          type="button"
                          className="seat-gate__text-btn"
                          onClick={() => cancelDesktopWebAuth()}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {!waitingForDesktopAuth ? (
                  <div className="seat-gate__pay-anchor">
                    <button
                      ref={signInRef}
                      type="button"
                      className="seat-gate__pay"
                      autoFocus={false}
                      disabled={busy}
                      onClick={() => void handleSignIn()}
                    >
                      {busy ? "Signing in…" : t("common.signIn")}
                      {!busy && <ArrowRight size={16} strokeWidth={2} aria-hidden />}
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="seat-gate__legal">
                <a href={`${SITE_URL}/terms`} target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </a>
                <span aria-hidden> and </span>
                <a href={`${SITE_URL}/privacy`} target="_blank" rel="noopener noreferrer">
                  privacy policy
                </a>
                {!isDesktop ? (
                  <>
                    <span aria-hidden> · </span>
                    <a href={getLandingUrl()}>meetra.cc</a>
                  </>
                ) : null}
              </p>
              </>
            ) : (
              <>
            <div className="seat-gate__brand" aria-label={APP_DISPLAY_NAME}>
              <img
                src={`${import.meta.env.BASE_URL}meetra-mark.svg`}
                alt=""
                className="app-chrome-row__brand-logo"
                draggable={false}
              />
              <span className="app-chrome-row__brand-wordmark">Meetra</span>
            </div>
            <div className="seat-gate__pay-head">
              <h1 id="auth-gate-title" className="seat-gate__title">
                {connectionError ? "Connection failed" : "Loading"}
              </h1>
            </div>
              <div className="seat-gate__fields">
                {connectionError ? (
                  <>
                    <p className="seat-gate__lead">Check your internet connection, then try again.</p>
                    {onRetry ? (
                      <button type="button" className="seat-gate__pay" onClick={onRetry}>
                        Try again
                      </button>
                    ) : null}
                  </>
                ) : (
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
                )}
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
