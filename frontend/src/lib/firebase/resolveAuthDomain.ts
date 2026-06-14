/**
 * Firebase redirect sign-in requires authDomain to match the app host when not
 * on *.firebaseapp.com (see Firebase redirect best practices).
 */
export function resolveAuthDomain(): string {
  const fromEnv = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return hostname;
    }
    if (hostname) return hostname;
  }

  return "forma-cad-dev.firebaseapp.com";
}
