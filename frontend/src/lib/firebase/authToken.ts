import { getIdToken } from "./client";

export async function getAuthIdToken(forceRefresh = false): Promise<string | null> {
  return getIdToken(forceRefresh);
}
