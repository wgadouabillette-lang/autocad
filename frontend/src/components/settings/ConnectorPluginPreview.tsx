import { useEffect, useState } from "react";
import type { ChatConnectorId } from "../chat/chatConnectors";
import {
  fetchConnectorPreview,
  type ConnectorPreviewMessage,
  type FigmaPreviewResult,
  type NotionPreviewItem,
  type SpotifyPreviewResult,
} from "../../lib/connectorsApi";
import type { GoogleCalendarEvent } from "../../lib/calendarSync";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "messages"; items: ConnectorPreviewMessage[] }
  | { status: "notion"; items: NotionPreviewItem[] }
  | { status: "figma"; data: FigmaPreviewResult }
  | { status: "spotify"; data: SpotifyPreviewResult }
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

    let cancelled = false;
    setState({ status: "loading" });

    void fetchConnectorPreview(connectorId, 5)
      .then((data) => {
        if (cancelled) return;
        if (connectorId === "gmail" || connectorId === "outlook") {
          setState({ status: "messages", items: data as ConnectorPreviewMessage[] });
          return;
        }
        if (connectorId === "notion") {
          setState({ status: "notion", items: data as NotionPreviewItem[] });
          return;
        }
        if (connectorId === "figma") {
          setState({ status: "figma", data: data as FigmaPreviewResult });
          return;
        }
        if (connectorId === "spotify") {
          setState({ status: "spotify", data: data as SpotifyPreviewResult });
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
      {state.status === "notion" && (
        <ul className="connector-plugin-preview__list">
          {state.items.length === 0 ? (
            <li className="connector-plugin-preview__meta">Aucune page trouvée.</li>
          ) : (
            state.items.map((item) => (
              <li key={item.id} className="connector-plugin-preview__item">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="connector-plugin-preview__title connector-plugin-preview__link"
                >
                  {item.title}
                </a>
                <span className="connector-plugin-preview__meta">{item.type}</span>
              </li>
            ))
          )}
        </ul>
      )}
      {state.status === "figma" && (
        <div className="connector-plugin-preview__figma">
          {state.data.profile?.handle && (
            <p className="connector-plugin-preview__meta">@{state.data.profile.handle}</p>
          )}
          {state.data.hint && (
            <p className="connector-plugin-preview__meta">{state.data.hint}</p>
          )}
          <ul className="connector-plugin-preview__list">
            {state.data.files.length === 0 ? (
              <li className="connector-plugin-preview__meta">Aucun fichier listé.</li>
            ) : (
              state.data.files.map((file) => (
                <li key={file.key} className="connector-plugin-preview__item">
                  <a
                    href={`https://www.figma.com/file/${file.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="connector-plugin-preview__title connector-plugin-preview__link"
                  >
                    {file.name}
                  </a>
                  <span className="connector-plugin-preview__meta">
                    {file.projectName || "Figma"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
      {state.status === "spotify" && (
        <div className="connector-plugin-preview__spotify">
          {!state.data.track ? (
            <p className="connector-plugin-preview__meta">
              {state.data.playing ? "Lecture en cours…" : "Aucune lecture active."}
            </p>
          ) : (
            <div className="connector-plugin-preview__item">
              {state.data.track.url ? (
                <a
                  href={state.data.track.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="connector-plugin-preview__title connector-plugin-preview__link"
                >
                  {state.data.track.name}
                </a>
              ) : (
                <span className="connector-plugin-preview__title">{state.data.track.name}</span>
              )}
              <span className="connector-plugin-preview__meta">
                {state.data.track.artists}
                {state.data.track.album ? ` · ${state.data.track.album}` : ""}
                {state.data.device ? ` · ${state.data.device}` : ""}
              </span>
            </div>
          )}
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
