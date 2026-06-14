import { useCallback, useEffect, useState } from "react";
import type { ChatConnectorId } from "../components/chat/chatConnectors";
import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";
import {
  disconnectConnector,
  fetchConnectorStatuses,
  isConnectorOAuthMessage,
  startConnectorOAuth,
  type ConnectorStatus,
} from "../lib/connectorsApi";
import { useNotificationsStore } from "../store/useNotificationsStore";

/** Connectors are display-only until OAuth/backend wiring is ready. */
export const CONNECTORS_VISUAL_ONLY = true;

const VISUAL_STATUSES: ConnectorStatus[] = CHAT_CONNECTORS.map(({ id, label }) => ({
  id,
  label,
  provider: id,
  connected: false,
  configured: false,
}));

export function useConnectors() {
  const [statuses, setStatuses] = useState<ConnectorStatus[]>(
    CONNECTORS_VISUAL_ONLY ? VISUAL_STATUSES : [],
  );
  const [loading, setLoading] = useState(!CONNECTORS_VISUAL_ONLY);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<ChatConnectorId | null>(null);
  const pushNotification = useNotificationsStore((s) => s.push);

  const refresh = useCallback(async () => {
    if (CONNECTORS_VISUAL_ONLY) return;
    try {
      const items = await fetchConnectorStatuses();
      setStatuses(items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connectors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (CONNECTORS_VISUAL_ONLY) return;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (CONNECTORS_VISUAL_ONLY) return;
    const onDone = () => void refresh();
    window.addEventListener("forma-connector-oauth-done", onDone);
    window.addEventListener("forma-connector-disconnect-done", onDone);
    return () => {
      window.removeEventListener("forma-connector-oauth-done", onDone);
      window.removeEventListener("forma-connector-disconnect-done", onDone);
    };
  }, [refresh]);

  useEffect(() => {
    if (CONNECTORS_VISUAL_ONLY) return;
    const onMessage = (event: MessageEvent) => {
      if (!isConnectorOAuthMessage(event.data)) return;
      setConnectingId(null);
      if (event.data.status === "success" && event.data.connectorId) {
        void refresh();
        const label =
          statuses.find((s) => s.id === event.data.connectorId)?.label ?? event.data.connectorId;
        pushNotification({
          kind: "connector",
          title: `${label} connected`,
          body: "Your account is linked and ready to use in chat.",
        });
      } else if (event.data.message) {
        setError(event.data.message);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushNotification, refresh, statuses]);

  const connectedIds = new Set(
    statuses.filter((s) => s.connected).map((s) => s.id as ChatConnectorId),
  );

  const connect = useCallback(
    async (id: ChatConnectorId) => {
      if (CONNECTORS_VISUAL_ONLY) return;
      setConnectingId(id);
      setError(null);
      try {
        const url = await startConnectorOAuth(id);
        const popup = window.open(url, "forma-connector-oauth", "width=520,height=720");
        if (!popup) {
          window.location.href = url;
          return;
        }
        const timer = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(timer);
            setConnectingId(null);
            void refresh();
          }
        }, 500);
      } catch (err) {
        setConnectingId(null);
        setError(err instanceof Error ? err.message : "OAuth failed.");
      }
    },
    [refresh],
  );

  const disconnect = useCallback(
    async (id: ChatConnectorId) => {
      if (CONNECTORS_VISUAL_ONLY) return;
      try {
        await disconnectConnector(id);
        await refresh();
        window.dispatchEvent(
          new CustomEvent("forma-connector-disconnect-done", { detail: { connectorId: id } }),
        );
        const label = statuses.find((s) => s.id === id)?.label ?? id;
        pushNotification({
          kind: "connector",
          title: `${label} déconnecté`,
          body: "Le compte n'est plus lié.",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Échec de la déconnexion.");
      }
    },
    [pushNotification, refresh, statuses],
  );

  return {
    visualOnly: CONNECTORS_VISUAL_ONLY,
    statuses,
    connectedIds,
    loading,
    error,
    connectingId,
    refresh,
    connect,
    disconnect,
  };
}
