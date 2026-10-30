import { create } from "zustand";
import type { ChatConnectorId } from "../components/chat/chatConnectors";
import {
  CHAT_CONNECTORS,
  isConnectorComingSoon,
} from "../components/chat/chatConnectors";
import {
  disconnectConnector as apiDisconnectConnector,
  fetchConnectorStatuses,
  startConnectorOAuth,
  type ConnectorStatus,
} from "../lib/connectorsApi";
import { tryFinishConnectorOAuthFromStorage } from "../lib/connectorOAuthResult";
import { hasFormaDesktop } from "../lib/formaDesktop";

const VISUAL_STATUSES: ConnectorStatus[] = CHAT_CONNECTORS.map(({ id, label }) => ({
  id,
  label,
  provider: id,
  connected: false,
  configured: false,
}));

export type ConnectorStatusSource = "none" | "visual" | "api";

/** Safari / iOS bloquent souvent les popups OAuth — même onglet plus fiable. */
function prefersSameTabOAuth(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos || isSafari;
}

interface ConnectorsState {
  statuses: ConnectorStatus[];
  statusSource: ConnectorStatusSource;
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
  statusSource: "none",
  loading: true,
  error: null,
  connectingId: null,
  inflight: null,

  setVisualOnly: () =>
    set({ statuses: VISUAL_STATUSES, statusSource: "visual", loading: false, error: null }),

  refresh: async (force = false) => {
    const current = get().inflight;
    if (current && !force) return current;
    const promise = (async () => {
      try {
        const items = await fetchConnectorStatuses();
        set({ statuses: items, statusSource: "api", error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load connectors.";
        const authFailed = /authentication required/i.test(message);
        set({
          error: message,
          ...(authFailed
            ? { statuses: VISUAL_STATUSES, statusSource: "visual" as const }
            : {}),
        });
      } finally {
        set({ loading: false, inflight: null });
      }
    })();
    set({ inflight: promise, loading: true });
    await promise;
  },

  connect: async (id) => {
    if (isConnectorComingSoon(id)) {
      set({
        error: "Ce connecteur n'est pas encore disponible.",
      });
      return;
    }
    set({ connectingId: id, error: null });
    const watchConnection = () => {
      const deadline = Date.now() + 3 * 60 * 1000;
      let timer = 0;
      let stopped = false;
      function stop() {
        if (stopped) return;
        stopped = true;
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
      }
      async function tick() {
        if (stopped || get().connectingId !== id) {
          stop();
          return;
        }
        if (Date.now() > deadline) {
          set({ connectingId: null });
          stop();
          return;
        }
        try {
          await get().refresh(true);
        } catch {
          // Keep polling. A single failed status read must not leave the row on "connecting".
        }
        if (stopped || get().connectingId !== id) {
          stop();
          return;
        }
        if (get().statuses.some((status) => status.id === id && status.connected)) {
          set({ connectingId: null, error: null });
          window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
          stop();
          return;
        }
        timer = window.setTimeout(() => void tick(), 1500);
      }
      function onVisible() {
        if (document.visibilityState !== "visible" || stopped) return;
        window.clearTimeout(timer);
        void tick();
      }
      document.addEventListener("visibilitychange", onVisible);
      timer = window.setTimeout(() => void tick(), 800);
    };
    try {
      const url = await startConnectorOAuth(id);
      if (prefersSameTabOAuth()) {
        window.location.assign(url);
        return;
      }
      const desktop = window.formaDesktop;
      // Mac keeps a window with opener so the callback can message the app.
      // Windows opens the system browser; the status poll marks the account connected.
      if (hasFormaDesktop() && desktop?.platform === "win32" && desktop.openConnectorOAuth) {
        const opened = await desktop.openConnectorOAuth(url);
        if (!opened?.ok) throw new Error("Impossible d'ouvrir la fenêtre de connexion.");
        watchConnection();
        return;
      }
      if (hasFormaDesktop() && desktop?.platform === "win32" && desktop.openExternal) {
        await desktop.openExternal(url);
        watchConnection();
        return;
      }
      const popup = window.open(
        url,
        `forma-connector-oauth-${Date.now()}`,
        "popup,width=520,height=720",
      );
      if (!popup) {
        window.location.assign(url);
        return;
      }
      watchConnection();
      const timer = window.setInterval(() => {
        if (tryFinishConnectorOAuthFromStorage()) {
          window.clearInterval(timer);
          try {
            popup.close();
          } catch {
            // ignore
          }
          return;
        }
        if (popup.closed) {
          window.clearInterval(timer);
          void get().refresh(true);
        }
      }, 400);
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
      set((state) => ({
        statuses: state.statuses.map((s) =>
          s.id === id
            ? { ...s, connected: false, accountLabel: null, canSend: false }
            : s,
        ),
        error: null,
      }));
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
