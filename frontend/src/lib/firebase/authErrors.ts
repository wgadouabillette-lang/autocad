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
    return `Connexion ${label} refusée (session expirée ou configuration OAuth). Réessayez ou utilisez un autre mode de connexion.`;
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
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as FirebaseError).code === "string"
      ? (error as FirebaseError).code
      : null;
  return (
    code === "auth/popup-blocked" ||
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/invalid-credential"
  );
}
