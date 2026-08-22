import { getIdToken } from "./client";

export async function getAuthIdToken(forceRefresh = false): Promise<string | null> {
  return getIdToken(forceRefresh);
}

/** Wait until Firebase has an ID token after custom-token / credential sign-in. */
export async function waitForAuthIdToken(timeoutMs = 8000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let token = await getAuthIdToken(true);
  while (!token && Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    token = await getAuthIdToken(true);
  }
  return token;
}
