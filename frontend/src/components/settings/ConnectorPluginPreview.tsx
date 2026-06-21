import { useEffect, useState } from "react";
import type { ChatConnectorId } from "../chat/chatConnectors";
import {
  fetchConnectorPreview,
  type ConnectorPreviewMessage,
} from "../../lib/connectorsApi";
import type { GoogleCalendarEvent } from "../../lib/calendarSync";
import { useSpotifyPlayerStore } from "../../store/useSpotifyPlayerStore";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "messages"; items: ConnectorPreviewMessage[] }
  | { status: "spotify" }
  | { status: "calendar"; items: GoogleCalendarEvent[] };

export default function ConnectorPluginPreview({
  connectorId,
  connected,
}: {
  connectorId: ChatConnectorId;
  connected: boolean;
}) {
  const [state, setState] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (!connected) {
      setState({ status: "idle" });
      return;
    }

    if (connectorId === "spotify") {
      setState({ status: "spotify" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void fetchConnectorPreview(connectorId, 5)
      .then((data) => {
        if (cancelled) return;
        if (connectorId === "gmail" || connectorId === "outlook") {
          setState({ status: "messages", items: data as ConnectorPreviewMessage[] });
          return;
        }
        if (connectorId === "calendar") {
          setState({ status: "calendar", items: data as GoogleCalendarEvent[] });
          return;
        }
        setState({ status: "idle" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Aperçu indisponible.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [connectorId, connected]);

  if (!connected || state.status === "idle") return null;

  return (
    <div className="connector-plugin-preview">
      {state.status === "loading" && (
        <p className="connector-plugin-preview__meta">Chargement de l&apos;aperçu…</p>
      )}
      {state.status === "error" && (
        <p className="connector-plugin-preview__error">{state.message}</p>
      )}
      {state.status === "messages" && (
        <ul className="connector-plugin-preview__list">
          {state.items.length === 0 ? (
            <li className="connector-plugin-preview__meta">Aucun message récent.</li>
          ) : (
            state.items.map((item) => (
              <li key={item.id} className="connector-plugin-preview__item">
                <span className="connector-plugin-preview__title">{item.subject}</span>
                <span className="connector-plugin-preview__meta">
                  {item.from}
                  {item.snippet ? ` · ${item.snippet}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      {state.status === "spotify" && (
        <div className="connector-plugin-preview__spotify">
          <p className="connector-plugin-preview__meta">
            Recherche une piste, choisis-la dans la liste et écoute-la directement dans l&apos;app.
          </p>
          <button
            type="button"
            className="connector-plugin-preview__open-player"
            onClick={() => useSpotifyPlayerStore.getState().openPanel()}
          >
            Ouvrir le lecteur Spotify
          </button>
        </div>
      )}
      {state.status === "calendar" && (
        <ul className="connector-plugin-preview__list">
          {state.items.length === 0 ? (
            <li className="connector-plugin-preview__meta">Aucun événement aujourd&apos;hui.</li>
          ) : (
            state.items.map((item) => {
              const startH = Math.floor(item.startMinutes / 60);
              const startM = item.startMinutes % 60;
              const time = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
              return (
                <li key={item.id} className="connector-plugin-preview__item">
                  <span className="connector-plugin-preview__title">{item.title}</span>
                  <span className="connector-plugin-preview__meta">{time}</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
