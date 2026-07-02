import type { FirebaseError } from "firebase/app";
import type { FirebaseAuthProvider } from "./client";

const PROVIDER_LABELS: Record<FirebaseAuthProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  facebook: "Facebook",
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/popup-blocked":
    "La fenêtre de connexion a été bloquée. Réessayez ou autorisez les pop-ups pour ce site.",
  "auth/popup-closed-by-user": "Connexion annulée.",
  "auth/cancelled-popup-request": "Connexion annulée.",
  "auth/unauthorized-domain":
    "Ce domaine n'est pas autorisé dans Firebase. Ajoutez-le dans Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed":
    "Ce mode de connexion n'est pas activé dans Firebase Authentication.",
  "auth/account-exists-with-different-credential":
    "Un compte existe déjà avec cette adresse email via un autre fournisseur.",
  "auth/invalid-credential":
    "Connexion refusée par le fournisseur (identifiants expirés ou mauvaise config OAuth). Réessayez ou utilisez Google / email.",
  "auth/network-request-failed": "Problème réseau. Vérifiez votre connexion.",
};

export function formatAuthError(error: unknown, provider?: FirebaseAuthProvider | null): string {
  if (error instanceof Error && error.message === "oauth-redirect-started") {
    return "";
  }
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as FirebaseError).code === "string"
      ? (error as FirebaseError).code
      : null;
  if (code === "auth/invalid-credential" && provider) {
    const label = PROVIDER_LABELS[provider];
    const message = error instanceof Error ? error.message : "";
    if (message.includes("invalid_client") || message.includes("client secret is invalid")) {
      if (provider === "facebook") {
        return `Connexion ${label} impossible : App ID ou App Secret Meta invalides dans Firebase. Voir docs/FACEBOOK_AUTH.md puis ./scripts/setup-facebook-login.sh`;
      }
      if (provider === "microsoft") {
        return `Connexion ${label} impossible : client Azure AD mal configuré dans Firebase. Vérifiez MICROSOFT_OAUTH_* puis ./scripts/configure-firebase-oauth-providers.sh`;
      }
      return `Connexion ${label} impossible : client OAuth Firebase mal configuré. Exécutez « firebase deploy --only auth » ou reconfigurez le fournisseur.`;
    }
    return `Connexion ${label} refusée (session expirée ou configuration OAuth). Réessayez ou utilisez un autre mode de connexion.`;
  }
  if (code === "auth/operation-not-allowed" && provider === "facebook") {
    return "Connexion Facebook non activée dans Firebase. Créez l'app Meta et exécutez ./scripts/setup-facebook-login.sh (voir docs/FACEBOOK_AUTH.md).";
  }
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Connexion impossible.";
}

export function shouldFallbackToOAuthRedirect(error: unknown): boolean {
  // Popup is reliable in local dev; redirect often fails to restore the session on localhost.
  if (import.meta.env.DEV) return false;

  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as FirebaseError).code === "string"
      ? (error as FirebaseError).code
      : null;
  // Never redirect on invalid-credential — redirect would fail the same way and loops back to login.
  return code === "auth/popup-blocked";
}
