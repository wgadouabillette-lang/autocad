import { getAuthIdToken } from "./firebase/authToken";

const BASE = "/api/account";

async function authHeaders(forceRefresh = false): Promise<HeadersInit> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = await getAuthIdToken(forceRefresh);
  if (!token) {
    throw new Error("Connectez-vous avant de supprimer votre compte.");
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function readError(r: Response): Promise<string> {
  const text = await r.text();
  try {
    const json = JSON.parse(text) as { detail?: string };
    return json.detail || text || `HTTP ${r.status}`;
  } catch {
    return text || `HTTP ${r.status}`;
  }
}

/** Supprime définitivement le compte et toutes les données associées. */
export async function deleteAccount(): Promise<void> {
  let r = await fetch(BASE, {
    method: "DELETE",
    headers: await authHeaders(false),
  });
  if (r.status === 401) {
    r = await fetch(BASE, {
      method: "DELETE",
      headers: await authHeaders(true),
    });
  }
  if (!r.ok) {
    throw new Error(await readError(r));
  }
}
