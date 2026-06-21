import { getAuthIdToken } from "./firebase/authToken";

export interface ConnectorStatus {
  id: string;
  label: string;
  provider: string;
  connected: boolean;
  configured: boolean;
  accountLabel?: string | null;
}

const BASE = "/api/connectors";

async function authHeaders(json = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  const token = await getAuthIdToken(true);
  if (!token) {
    throw new Error("Connectez-vous à l'app avant de lier un connecteur.");
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

export async function fetchConnectorStatuses(): Promise<ConnectorStatus[]> {
  const r = await fetch(BASE, { headers: await authHeaders() });
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { connectors: ConnectorStatus[] };
  return data.connectors;
}

export async function startConnectorOAuth(id: string): Promise<string> {
  const params = new URLSearchParams({
    return_origin: window.location.origin,
    return_path: import.meta.env.BASE_URL.replace(/\/$/, "") || "/app",
  });
  const r = await fetch(`${BASE}/${id}/authorize?${params}`, { headers: await authHeaders() });
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { url: string };
  return data.url;
}

export async function disconnectConnector(id: string): Promise<void> {
  const r = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(await readError(r));
}

export type ConnectorOAuthMessage = {
  type: "forma-connector-oauth";
  status: "success" | "error";
  connectorId: string | null;
  message: string | null;
};

export function isConnectorOAuthMessage(data: unknown): data is ConnectorOAuthMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as ConnectorOAuthMessage;
  return msg.type === "forma-connector-oauth";
}

export interface ConnectorPreviewMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export async function fetchGmailPreview(limit = 5): Promise<ConnectorPreviewMessage[]> {
  const r = await fetch(`${BASE}/gmail/messages?maxResults=${limit}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { messages?: ConnectorPreviewMessage[] };
  return data.messages ?? [];
}

export async function fetchOutlookPreview(limit = 5): Promise<ConnectorPreviewMessage[]> {
  const r = await fetch(`${BASE}/outlook/messages?maxResults=${limit}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { messages?: ConnectorPreviewMessage[] };
  return data.messages ?? [];
}

export type ChatConnectorIdForPreview =
  | "calendar"
  | "gmail"
  | "outlook"
  | "spotify";

export interface SpotifyPreviewTrack {
  id?: string;
  name: string;
  artists: string;
  album: string;
  url: string;
  durationMs?: number;
}

export interface SpotifyPreviewResult {
  playing: boolean;
  track: SpotifyPreviewTrack | null;
  device?: string | null;
  progressMs?: number;
}

export interface SpotifyTrackCard {
  id?: string;
  name: string;
  artists: string;
  album: string;
  imageUrl?: string | null;
  url: string;
  /** Extrait MP3 ~30 s — jouable dans l'app sans Premium Spotify. */
  previewUrl?: string | null;
}

export interface SpotifyPlayState {
  playing?: boolean;
  requiresPremium?: boolean;
  requiresActiveDevice?: boolean;
}

export interface SpotifyPlayResult {
  playing: boolean;
  track: SpotifyTrackCard | null;
  device?: string | null;
  // Spotify exige Premium pour `PUT /v1/me/player/play` ; sur compte gratuit on
  // dégrade en renvoyant juste la carte pour ouverture manuelle dans Spotify.
  requiresPremium?: boolean;
  requiresActiveDevice?: boolean;
}

export async function fetchSpotifyPreview(): Promise<SpotifyPreviewResult> {
  const r = await fetch(`${BASE}/spotify/playback`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as SpotifyPreviewResult;
}

export async function playSpotifyTrack(
  query: string,
  signal?: AbortSignal,
): Promise<SpotifyPlayResult> {
  const r = await fetch(`${BASE}/spotify/play`, {
    method: "POST",
    headers: await authHeaders(true),
    body: JSON.stringify({ query }),
    signal,
  });
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as SpotifyPlayResult;
}

export async function fetchConnectorPreview(
  id: ChatConnectorIdForPreview,
  limit = 5,
): Promise<unknown> {
  switch (id) {
    case "gmail":
      return fetchGmailPreview(limit);
    case "outlook":
      return fetchOutlookPreview(limit);
    case "spotify":
      return fetchSpotifyPreview();
    case "calendar": {
      const today = new Date();
      const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const { fetchGoogleCalendarEvents } = await import("./calendarSync");
      return fetchGoogleCalendarEvents(dateKey);
    }
    default:
      return [];
  }
}
