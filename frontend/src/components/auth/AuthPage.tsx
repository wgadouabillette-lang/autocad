import { FormEvent, useState } from "react";
import type { AuthProvider } from "../../store/useAuthStore";
import { useAuthStore } from "../../store/useAuthStore";
import { hasFormaDesktop } from "../../lib/formaDesktop";
import { FacebookIcon, GoogleIcon, MicrosoftIcon } from "./AuthProviderIcons";

const PROVIDERS: {
  id: AuthProvider;
  label: string;
  Icon: () => JSX.Element;
}[] = [
  { id: "google", label: "Continue with Google", Icon: GoogleIcon },
  { id: "microsoft", label: "Continue with Microsoft", Icon: MicrosoftIcon },
  { id: "facebook", label: "Continue with Facebook", Icon: FacebookIcon },
];

const LYTE_SITE_URL = "https://lyte.app";

function getLandingUrl(): string {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:5190/";
  }
  return "/";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function AuthPage() {
  const continueWithEmail = useAuthStore((s) => s.continueWithEmail);
  const signInWithProvider = useAuthStore((s) => s.signInWithProvider);
  const authError = useAuthStore((s) => s.authError);
  const emailLinkSent = useAuthStore((s) => s.emailLinkSent);
  const authEmail = useAuthStore((s) => s.authEmail);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const isDesktop = hasFormaDesktop();
  const trimmedEmail = email.trim();
  const canContinue = isValidEmail(trimmedEmail);

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canContinue || busy) return;
    setBusy(true);
    try {
      await continueWithEmail(trimmedEmail);
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = async (provider: AuthProvider) => {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithProvider(provider);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-page__brand">
        {isDesktop ? (
          <span className="auth-page__brand-mark" aria-hidden>
            Lyte
          </span>
        ) : (
          <a
            className="auth-page__brand-mark auth-page__brand-mark--link"
            href={getLandingUrl()}
            aria-label="Retour à la page d'accueil Lyte"
          >
            Lyte
          </a>
        )}
        <span className="sr-only">Lyte</span>
      </header>

      <main className="auth-page__main">
        <div className="auth-page__card">
          <h1 className="auth-page__title">Welcome to Lyte</h1>
          <p className="auth-page__subtitle">Connectez-vous pour synchroniser vos projets et clés API.</p>

          {authError && <p className="auth-page__error">{authError}</p>}

          {emailLinkSent ? (
            <p className="auth-page__subtitle">
              Un lien de connexion a été envoyé à <strong>{authEmail}</strong>. Ouvrez-le sur cet appareil pour
              continuer.
            </p>
          ) : (
            <>
              <div className="auth-page__providers">
                {PROVIDERS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className="auth-page__provider-btn"
                    disabled={busy}
                    onClick={() => void handleProvider(id)}
                  >
                    <Icon />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <form className="auth-page__email-form" onSubmit={(event) => void handleEmailSubmit(event)}>
                <label className="auth-page__email-label" htmlFor="auth-email">
                  Email address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  className="auth-page__email-input"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  disabled={busy}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary auth-page__continue-btn"
                  disabled={!canContinue || busy}
                >
                  {busy ? "Envoi…" : "Continue with email"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="auth-page__footer">
        <a
          href={`${LYTE_SITE_URL}/terms`}
          className="auth-page__legal-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Terms of Service
        </a>
        <span aria-hidden> and </span>
        <a
          href={`${LYTE_SITE_URL}/privacy`}
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
