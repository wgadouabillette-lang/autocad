import {
  isConnectorOAuthMessage,
  type ConnectorOAuthMessage,
} from "./connectorsApi";
import { useConnectorsStore } from "../store/useConnectorsStore";
import { useNotificationsStore } from "../store/useNotificationsStore";

export const CONNECTOR_OAUTH_STORAGE_KEY = "forma-connector-oauth-result";

export function consumeConnectorOAuthStorage(): ConnectorOAuthMessage | null {
  try {
    const raw = localStorage.getItem(CONNECTOR_OAUTH_STORAGE_KEY);
    if (!raw) return null;
    localStorage.removeItem(CONNECTOR_OAUTH_STORAGE_KEY);
    const data = JSON.parse(raw) as unknown;
    return isConnectorOAuthMessage(data) ? data : null;
  } catch {
    return null;
  }
}

export function applyConnectorOAuthResult(data: ConnectorOAuthMessage): void {
  useConnectorsStore.getState().setConnectingId(null);
  if (data.status === "success" && data.connectorId) {
    void useConnectorsStore.getState().refresh(true);
    window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
    return;
  }
  if (data.message) {
    useConnectorsStore.getState().setError(data.message);
    useNotificationsStore.getState().push({
      kind: "workspace",
      title: "Connecteur non lié",
      body: data.message,
    });
  }
}

export function tryFinishConnectorOAuthFromStorage(): boolean {
  const stored = consumeConnectorOAuthStorage();
  if (!stored) return false;
  applyConnectorOAuthResult(stored);
  return true;
}
