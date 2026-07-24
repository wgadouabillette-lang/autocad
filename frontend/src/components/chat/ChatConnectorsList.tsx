import { ArrowUpRight } from "lucide-react";
import { CHAT_CONNECTORS, isConnectorComingSoon, type ChatConnectorId } from "./chatConnectors";
import type { ConnectorStatus } from "../../lib/connectorsApi";
import SpotifyPluginSettingsExpand from "../settings/SpotifyPluginSettingsExpand";

export default function ChatConnectorsList({
  statuses,
  statusSource = "none",
  connectedIds,
  connectingId = null,
  connectError = null,
  variant = "chat",
  locked = false,
  onConnect,
  onDisconnect,
  onInsertSlash,
}: {
  statuses?: ConnectorStatus[];
  statusSource?: "none" | "visual" | "api";
  connectedIds: ReadonlySet<ChatConnectorId>;
  connectingId?: ChatConnectorId | null;
  connectError?: string | null;
  variant?: "chat" | "settings";
  locked?: boolean;
  onConnect: (id: ChatConnectorId) => void;
  onDisconnect?: (id: ChatConnectorId) => void;
  onInsertSlash: (slash: string) => void;
}) {
  const items = CHAT_CONNECTORS;
  const isSettings = variant === "settings";
  const statusById = new Map((statuses ?? []).map((status) => [status.id, status]));
  const statusesFromApi = statusSource === "api";

  const unavailableTitle = (configured: boolean, status: ConnectorStatus | undefined) => {
    if (configured) return undefined;
    if (statusesFromApi && status && !status.configured) {
      return "Ajoutez les clés OAuth dans backend/.env";
    }
    if (statusSource === "visual") {
      return isSettings
        ? "Connectez-vous pour lier un connecteur"
        : "Sign in to connect";
    }
    return undefined;
  };

  const unavailableLabel = (configured: boolean) => {
    if (configured) return isSettings ? "Connecter" : "Connect";
    if (statusesFromApi) return isSettings ? "Indisponible" : "Unavailable";
    return isSettings ? "Chargement…" : "Loading…";
  };

  return (
    <div
      className={
        isSettings
          ? "chat-connectors-list chat-connectors-list--settings"
          : "chat-connectors-list chat-connectors-list--from-bottom"
      }
      role="list"
      aria-label="Connectors"
    >
      {!locked && connectError && (
        <p className="chat-connectors-error px-0.5 pb-1 text-[11px] leading-snug text-red-400/90">
          {connectError}
        </p>
      )}
      {items.map(({ id, label, slash, Logo }, index) => {
        const status = statusById.get(id);
        const connected = connectedIds.has(id);
        const configured = status?.configured ?? false;
        const connecting = connectingId === id;
        const comingSoon = isConnectorComingSoon(id);
        const accountLabel = status?.accountLabel;
        const rowMain = (
          <div className="chat-connectors-row__main">
            <span className="chat-connectors-row__icon">
              <Logo />
            </span>
            <span className="chat-connectors-row__label-wrap">
              <span className="chat-connectors-row__label">{label}</span>
              {connected && accountLabel && (
                <span className="chat-connectors-row__meta">{accountLabel}</span>
              )}
              {comingSoon && (
                <span className="chat-connectors-row__meta">
                  {isSettings ? "Bientôt disponible" : "Coming soon"}
                </span>
              )}
              {!comingSoon && !configured && isSettings && statusesFromApi && (
                <span className="chat-connectors-row__meta">Non configuré sur le serveur</span>
              )}
            </span>
          </div>
        );

        const rowActions = locked ? (
          <span className="chat-connectors-row__slash chat-connectors-row__slash--preview">
            <span className="chat-connectors-row__slash-cmd">{slash}</span>
          </span>
        ) : isSettings && connected ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] text-muted-400">Connecté</span>
            <button
              type="button"
              className="chat-connectors-row__connect"
              onClick={() => onDisconnect?.(id)}
            >
              Déconnecter
            </button>
          </div>
        ) : isSettings ? (
          comingSoon ? (
            <span className="text-[11px] text-muted-500">Pas encore disponible</span>
          ) : (
            <button
              type="button"
              className="chat-connectors-row__connect"
              onClick={() => onConnect(id)}
              disabled={connecting || !configured || !statusesFromApi}
              title={unavailableTitle(configured, status)}
            >
              {connecting ? "Connexion…" : unavailableLabel(configured)}
              {!connecting && configured && (
                <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
              )}
            </button>
          )
        ) : connected ? (
          <button
            type="button"
            className="chat-connectors-row__slash"
            title={`Insert ${slash}`}
            onClick={() => onInsertSlash(slash)}
          >
            use <span className="chat-connectors-row__slash-cmd">{slash}</span>
          </button>
        ) : comingSoon ? (
          <span className="text-[11px] text-muted-500">Coming soon</span>
        ) : (
          <button
            type="button"
            className="chat-connectors-row__connect"
            onClick={() => onConnect(id)}
            disabled={connecting || !configured || !statusesFromApi}
            title={unavailableTitle(configured, status)}
          >
            {connecting ? "Connecting…" : unavailableLabel(configured)}
            {!connecting && configured && (
              <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
            )}
          </button>
        );

        const spotifySettingsExpanded = isSettings && id === "spotify" && connected;
        return (
          <div
            key={id}
            role="listitem"
            className={
              spotifySettingsExpanded
                ? "chat-connectors-row chat-connectors-row--spotify-expanded"
                : "chat-connectors-row"
            }
            style={
              isSettings ? undefined : { animationDelay: `${(items.length - 1 - index) * 55}ms` }
            }
          >
            {spotifySettingsExpanded ? (
              <>
                <div className="chat-connectors-row__header">
                  {rowMain}
                  {rowActions}
                </div>
                <div className="chat-connectors-row__expand">
                  <SpotifyPluginSettingsExpand />
                </div>
              </>
            ) : (
              <>
                {rowMain}
                {rowActions}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
