const DEFAULT_AUTH_DOMAIN = "forma-cad-dev.firebaseapp.com";

/**
 * Use the Firebase project auth domain (not the page hostname).
 *
 * meetra.cc is on Vercel. Treating it as authDomain made Google request
 * `https://meetra.cc/__/auth/handler`. If that URI is missing on Firebase's
 * default Web client, Google shows "La demande de cette appli n'est pas valide".
 * localhost already used *.firebaseapp.com; keep production on the same path.
 * meetra.cc remains an authorized domain so the opener origin is allowed.
 */
export function resolveAuthDomain(): string {
  const fromEnv = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  return fromEnv || DEFAULT_AUTH_DOMAIN;
}
