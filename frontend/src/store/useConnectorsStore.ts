import { create } from "zustand";
import type { ChatConnectorId } from "../components/chat/chatConnectors";
import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";
import {
  disconnectConnector as apiDisconnectConnector,
  fetchConnectorStatuses,
  startConnectorOAuth,
  type ConnectorStatus,
} from "../lib/connectorsApi";

const VISUAL_STATUSES: ConnectorStatus[] = CHAT_CONNECTORS.map(({ id, label }) => ({
  id,
  label,
  provider: id,
  connected: false,
  configured: false,
}));

/** Safari / iOS bloquent souvent les popups OAuth — même onglet plus fiable. */
function prefersSameTabOAuth(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos || isSafari;
}

interface ConnectorsState {
  statuses: ConnectorStatus[];
  loading: boolean;
  error: string | null;
  connectingId: ChatConnectorId | null;
  /** Promise courante pour dédupliquer les fetchs concurrents. */
  inflight: Promise<void> | null;

  setVisualOnly: () => void;
  refresh: (force?: boolean) => Promise<void>;
  connect: (id: ChatConnectorId) => Promise<void>;
  disconnect: (id: ChatConnectorId) => Promise<void>;
  setError: (message: string | null) => void;
  setConnectingId: (id: ChatConnectorId | null) => void;
}

/**
 * Source de vérité unique pour les statuts des connecteurs OAuth.
 * Les hooks `useConnectors` lisent ce store, donc Paramètres → Plugins et la
 * liste des connecteurs du chat affichent toujours les mêmes données.
 */
export const useConnectorsStore = create<ConnectorsState>((set, get) => ({
  statuses: [],
  loading: true,
  error: null,
  connectingId: null,
  inflight: null,

  setVisualOnly: () => set({ statuses: VISUAL_STATUSES, loading: false, error: null }),

  refresh: async (force = false) => {
    const current = get().inflight;
    if (current && !force) return current;
    const promise = (async () => {
      try {
        const items = await fetchConnectorStatuses();
        set({ statuses: items, error: null });
      } catch (err) {
        set({
          error: err instanceof Error ? err.message : "Failed to load connectors.",
        });
      } finally {
        set({ loading: false, inflight: null });
      }
    })();
    set({ inflight: promise });
    await promise;
  },

  connect: async (id) => {
    set({ connectingId: id, error: null });
    try {
      const url = await startConnectorOAuth(id);
      if (prefersSameTabOAuth()) {
        window.location.assign(url);
        return;
      }
      const popup = window.open(url, "forma-connector-oauth", "width=520,height=720");
      if (!popup) {
        window.location.assign(url);
        return;
      }
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer);
          set({ connectingId: null });
          void get().refresh(true);
        }
      }, 500);
    } catch (err) {
      set({
        connectingId: null,
        error: err instanceof Error ? err.message : "OAuth failed.",
      });
    }
  },

  disconnect: async (id) => {
    try {
      await apiDisconnectConnector(id);
      if (id === "spotify") {
        const { resetSpotifyWebPlayer } = await import("../lib/spotifyWebPlayback");
        resetSpotifyWebPlayer();
      }
      await get().refresh(true);
      window.dispatchEvent(
        new CustomEvent("forma-connector-disconnect-done", { detail: { connectorId: id } }),
      );
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Échec de la déconnexion.",
      });
    }
  },

  setError: (message) => set({ error: message }),
  setConnectingId: (id) => set({ connectingId: id }),
}));
