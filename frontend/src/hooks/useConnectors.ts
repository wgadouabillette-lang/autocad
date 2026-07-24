import { useCallback, useEffect, useMemo } from "react";
import type { ChatConnectorId } from "../components/chat/chatConnectors";
import { isConnectorOAuthMessage, warmConnectorAuth } from "../lib/connectorsApi";
import {
  applyConnectorOAuthResult,
  tryFinishConnectorOAuthFromStorage,
} from "../lib/connectorOAuthResult";
import { isMarketingPreview } from "../lib/marketingPreview";
import { useAuthStore } from "../store/useAuthStore";
import { useConnectorsStore } from "../store/useConnectorsStore";

/** Connectors OAuth is wired to the backend (requires GOOGLE_CLIENT_ID/SECRET). */
export const CONNECTORS_VISUAL_ONLY = false;

/**
 * Hook léger qui lit le store partagé `useConnectorsStore` et l'alimente.
 * Plusieurs panneaux (Paramètres, Chat) peuvent l'appeler simultanément :
 * ils partagent désormais les mêmes statuts (un seul fetch dédupliqué).
 */
export function useConnectors() {
  const authReady = useAuthStore((s) => s.ready);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const statuses = useConnectorsStore((s) => s.statuses);
  const statusSource = useConnectorsStore((s) => s.statusSource);
  const loading = useConnectorsStore((s) => s.loading);
  const error = useConnectorsStore((s) => s.error);
  const connectingId = useConnectorsStore((s) => s.connectingId);
  const refreshStore = useConnectorsStore((s) => s.refresh);
  const connectStore = useConnectorsStore((s) => s.connect);
  const disconnectStore = useConnectorsStore((s) => s.disconnect);
  const setVisualOnly = useConnectorsStore((s) => s.setVisualOnly);
  const setError = useConnectorsStore((s) => s.setError);
  const refresh = useCallback(
    async (force = false) => {
      if (isMarketingPreview() || CONNECTORS_VISUAL_ONLY || !authReady || !isAuthenticated) return;
      await refreshStore(force);
    },
    [authReady, isAuthenticated, refreshStore],
  );

  useEffect(() => {
    if (isMarketingPreview() || CONNECTORS_VISUAL_ONLY) {
      if (!isMarketingPreview()) setVisualOnly();
      return;
    }
    if (!authReady) return;
    if (!isAuthenticated) {
      setVisualOnly();
      return;
    }
    warmConnectorAuth();
    void refresh(true);
  }, [authReady, isAuthenticated, refresh, setVisualOnly]);

  useEffect(() => {
    if (CONNECTORS_VISUAL_ONLY) return;
    const onDone = () => void refresh(true);
    window.addEventListener("forma-connector-oauth-done", onDone);
    window.addEventListener("forma-connector-disconnect-done", onDone);
    return () => {
      window.removeEventListener("forma-connector-oauth-done", onDone);
      window.removeEventListener("forma-connector-disconnect-done", onDone);
    };
  }, [refresh]);

  useEffect(() => {
    if (CONNECTORS_VISUAL_ONLY) return;
    void tryFinishConnectorOAuthFromStorage();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isConnectorOAuthMessage(event.data)) return;
      applyConnectorOAuthResult(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (CONNECTORS_VISUAL_ONLY) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "forma-connector-oauth-result") return;
      tryFinishConnectorOAuthFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const connectedIds = useMemo(
    () =>
      new Set(
        statuses.filter((s) => s.connected).map((s) => s.id as ChatConnectorId),
      ),
    [statuses],
  );

  const connect = useCallback(
    async (id: ChatConnectorId) => {
      if (CONNECTORS_VISUAL_ONLY) return;
      if (!isAuthenticated) {
        setError("Connectez-vous à l'app avant de lier un connecteur.");
        return;
      }
      await connectStore(id);
    },
    [isAuthenticated, connectStore, setError],
  );

  const disconnect = useCallback(
    async (id: ChatConnectorId) => {
      if (CONNECTORS_VISUAL_ONLY) return;
      await disconnectStore(id);
    },
    [disconnectStore],
  );

  return {
    visualOnly: CONNECTORS_VISUAL_ONLY,
    statuses,
    statusSource,
    connectedIds,
    loading,
    error,
    connectingId,
    refresh,
    connect,
    disconnect,
  };
}
