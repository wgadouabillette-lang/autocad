const SIGN_IN_AUTH_DOMAIN = "meetra.cc";

/**
 * Google's account picker shows this host ("accéder à l'application …").
 * meetra.cc proxies /__/auth/* to Firebase Hosting, and the OAuth client
 * allows https://meetra.cc/__/auth/handler.
 */
export function resolveAuthDomain(): string {
  return SIGN_IN_AUTH_DOMAIN;
}
