const DEFAULT_AUTH_DOMAIN = "forma-cad-dev.firebaseapp.com";

function isLocalDevHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isFirebaseHostedDomain(hostname: string): boolean {
  return hostname.endsWith(".firebaseapp.com") || hostname.endsWith(".web.app");
}

/**
 * Firebase redirect sign-in requires authDomain to match the app host on custom
 * domains (see Firebase redirect best practices). Local dev must keep the
 * project *.firebaseapp.com domain so Google OAuth popup works.
 */
export function resolveAuthDomain(): string {
  const fromEnv = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const fallback = fromEnv || DEFAULT_AUTH_DOMAIN;

  if (typeof window === "undefined") return fallback;

  const hostname = window.location.hostname;
  if (!hostname || isLocalDevHost(hostname) || isFirebaseHostedDomain(hostname)) {
    return fallback;
  }

  return hostname;
}
