import type { ChatConnectorId } from "../components/chat/chatConnectors";

export interface ConnectorStatus {
  id: ChatConnectorId;
  label: string;
  provider: string;
  connected: boolean;
  configured: boolean;
}

const BASE = "/api/connectors";

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
  const r = await fetch(BASE);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { connectors: ConnectorStatus[] };
  return data.connectors;
}

export async function startConnectorOAuth(id: ChatConnectorId): Promise<string> {
  const r = await fetch(`${BASE}/${id}/authorize`);
  if (!r.ok) throw new Error(await readError(r));
  const data = (await r.json()) as { url: string };
  return data.url;
}

export async function disconnectConnector(id: ChatConnectorId): Promise<void> {
  const r = await fetch(`${BASE}/${id}`, { method: "DELETE" });
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
