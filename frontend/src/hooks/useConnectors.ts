import { useCallback, useEffect, useState } from "react";
import type { ChatConnectorId } from "../components/chat/chatConnectors";
import {
  disconnectConnector,
  fetchConnectorStatuses,
  isConnectorOAuthMessage,
  startConnectorOAuth,
  type ConnectorStatus,
} from "../lib/connectorsApi";
import { useNotificationsStore } from "../store/useNotificationsStore";

export function useConnectors() {
  const [statuses, setStatuses] = useState<ConnectorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<ChatConnectorId | null>(null);
  const pushNotification = useNotificationsStore((s) => s.push);

  const refresh = useCallback(async () => {
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
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onDone = () => void refresh();
    window.addEventListener("forma-connector-oauth-done", onDone);
    window.addEventListener("forma-connector-disconnect-done", onDone);
    return () => {
      window.removeEventListener("forma-connector-oauth-done", onDone);
      window.removeEventListener("forma-connector-disconnect-done", onDone);
    };
  }, [refresh]);

  useEffect(() => {
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
