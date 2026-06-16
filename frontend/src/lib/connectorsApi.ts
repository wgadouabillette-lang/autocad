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
  const r = await fetch(`${BASE}/${id}/authorize`, { headers: await authHeaders() });
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

export interface NotionPreviewItem {
  id: string;
  type: string;
  title: string;
  url: string;
}

export async function fetchNotionPreview(limit = 5): Promise<NotionPreviewItem[]> {
  const r = await fetch(`${BASE}/notion/search?pageSize=${limit}`, {
    headers: await authHeaders(),
  });
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { results?: NotionPreviewItem[] };
  return data.results ?? [];
}
