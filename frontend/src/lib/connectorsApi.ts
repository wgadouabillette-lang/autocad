import { getAuthIdToken } from "./firebase/authToken";

export interface ConnectorStatus {
  id: string;
  label: string;
  provider: string;
  connected: boolean;
  configured: boolean;
  accountLabel?: string | null;
  canSend?: boolean;
}

const BASE = "/api/connectors";

let cachedAuthToken: string | null = null;
let cachedAuthTokenAt = 0;
const AUTH_TOKEN_TTL_MS = 4 * 60 * 1000;

async function connectorAuthToken(forceRefresh = false): Promise<string | null> {
  if (
    !forceRefresh &&
    cachedAuthToken &&
    Date.now() - cachedAuthTokenAt < AUTH_TOKEN_TTL_MS
  ) {
    return cachedAuthToken;
  }
  const token = await getAuthIdToken(forceRefresh);
  if (token) {
    cachedAuthToken = token;
    cachedAuthTokenAt = Date.now();
  }
  return token;
}

async function authHeaders(opts?: {
  json?: boolean;
  forceRefresh?: boolean;
}): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (opts?.json) headers["Content-Type"] = "application/json";
  const token = await connectorAuthToken(opts?.forceRefresh ?? false);
  if (!token) {
    throw new Error("Connectez-vous à l'app avant de lier un connecteur.");
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchWithAuth(
  path: string,
  init: RequestInit = {},
  authOpts?: { json?: boolean; forceRefresh?: boolean },
): Promise<Response> {
  const buildHeaders = async (forceRefresh: boolean) => ({
    ...(init.headers as Record<string, string>),
    ...(await authHeaders({
      json: authOpts?.json,
      forceRefresh: forceRefresh || authOpts?.forceRefresh,
    })),
  });
  let r = await fetch(`${BASE}${path}`, { ...init, headers: await buildHeaders(false) });
  if (r.status === 401) {
    r = await fetch(`${BASE}${path}`, { ...init, headers: await buildHeaders(true) });
  }
  return r;
}

export function warmConnectorAuth(): void {
  void connectorAuthToken(false);
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
  const r = await fetchWithAuth("");
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { connectors: ConnectorStatus[] };
  return data.connectors;
}

export async function startConnectorOAuth(id: string): Promise<string> {
  const params = new URLSearchParams({
    return_origin: window.location.origin,
    return_path: import.meta.env.BASE_URL.replace(/\/$/, "") || "/app",
  });
  const r = await fetchWithAuth(`/${id}/authorize?${params}`);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { url: string };
  return data.url;
}

export async function disconnectConnector(id: string): Promise<void> {
  const r = await fetchWithAuth(`/${id}`, { method: "DELETE" });
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
  const r = await fetchWithAuth(`/gmail/messages?maxResults=${limit}`);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { messages?: ConnectorPreviewMessage[] };
  return data.messages ?? [];
}

export interface GmailStatus {
  connected: boolean;
  configured: boolean;
  storageReady?: boolean;
  accountLabel?: string | null;
  canSend?: boolean;
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  const r = await fetchWithAuth("/gmail/status");
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as GmailStatus;
}

export interface GmailSendAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface GmailSendInput {
  to: string[];
  subject: string;
  body: string;
  bodyHtml?: boolean;
  attachments?: GmailSendAttachment[];
}

export interface GmailSendResult {
  ok: boolean;
  messageId?: string | null;
  recipients?: string[];
}

export async function sendGmailMessage(input: GmailSendInput): Promise<GmailSendResult> {
  const r = await fetchWithAuth(
    "/gmail/send",
    {
    method: "POST",
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      body: input.body,
      bodyHtml: input.bodyHtml ?? false,
      attachments: input.attachments ?? [],
    }),
    },
    { json: true },
  );
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as GmailSendResult;
}

export async function fetchOutlookPreview(limit = 5): Promise<ConnectorPreviewMessage[]> {
  const r = await fetchWithAuth(`/outlook/messages?maxResults=${limit}`);
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
  const r = await fetchWithAuth("/spotify/playback");
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as SpotifyPreviewResult;
}

export async function searchSpotifyTracks(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<SpotifyTrackCard[]> {
  // Spotify Feb 2026: search limit max is 10.
  const capped = Math.max(1, Math.min(limit, 10));
  const params = new URLSearchParams({ q: query.trim(), limit: String(capped) });
  const r = await fetchWithAuth(`/spotify/search?${params}`, { signal });
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { tracks?: SpotifyTrackCard[] };
  return data.tracks ?? [];
}

export type SpotifyRecentlyPlayedTrack = SpotifyTrackCard & { playedAt?: string };

export async function fetchSpotifyRecentlyPlayed(
  limit = 50,
): Promise<SpotifyRecentlyPlayedTrack[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const r = await fetchWithAuth(`/spotify/recently-played?${params}`);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { tracks?: SpotifyRecentlyPlayedTrack[] };
  return data.tracks ?? [];
}

export async function fetchSpotifyRecommendations(input: {
  seedGenres?: string[];
  seedTracks?: string[];
  limit?: number;
}): Promise<SpotifyTrackCard[]> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 12) });
  if (input.seedGenres?.length) {
    params.set("seed_genres", input.seedGenres.join(","));
  }
  if (input.seedTracks?.length) {
    params.set("seed_tracks", input.seedTracks.join(","));
  }
  const r = await fetchWithAuth(`/spotify/recommendations?${params}`);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { tracks?: SpotifyTrackCard[] };
  return data.tracks ?? [];
}

export async function fetchSpotifyPlayerConfig(): Promise<{
  clientId: string;
  premium: boolean;
  hasStreamingScope?: boolean;
  reconnectRequired?: boolean;
}> {
  const r = await fetchWithAuth("/spotify/player-config");
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as {
    clientId: string;
    premium: boolean;
    hasStreamingScope?: boolean;
    reconnectRequired?: boolean;
  };
}

export async function fetchSpotifyPlayerToken(): Promise<string> {
  const r = await fetchWithAuth("/spotify/player-token");
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { accessToken: string };
  return data.accessToken;
}

export async function fetchSpotifyBeatGrid(
  trackId: string,
): Promise<{ beats: number[]; tempo: number | null }> {
  const r = await fetchWithAuth(`/spotify/tracks/${encodeURIComponent(trackId)}/beat-grid`);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { beats?: number[]; tempo?: number | null };
  return {
    beats: Array.isArray(data.beats) ? data.beats : [],
    tempo: typeof data.tempo === "number" ? data.tempo : null,
  };
}

export async function playSpotifyTrack(
  query: string,
  signal?: AbortSignal,
): Promise<SpotifyPlayResult> {
  const r = await fetchWithAuth(
    "/spotify/play",
    {
    method: "POST",
    body: JSON.stringify({ query }),
    signal,
    },
    { json: true },
  );
  if (!r.ok) throw new Error(await readError(r));
  return (await r.json()) as SpotifyPlayResult;
}

export async function playSpotifyTrackById(
  trackId: string,
  signal?: AbortSignal,
): Promise<SpotifyPlayResult> {
  const r = await fetchWithAuth(
    "/spotify/play",
    {
    method: "POST",
    body: JSON.stringify({ trackId }),
    signal,
    },
    { json: true },
  );
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
