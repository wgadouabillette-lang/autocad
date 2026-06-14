import { ArrowUpRight } from "lucide-react";
import { CHAT_CONNECTORS, type ChatConnectorId } from "./chatConnectors";

export default function ChatConnectorsList({
  connectedIds,
  connectingId = null,
  connectError = null,
  variant = "chat",
  locked = false,
  onConnect,
  onDisconnect,
  onInsertSlash,
}: {
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
        const connected = connectedIds.has(id);
        const connecting = connectingId === id;
        return (
          <div
            key={id}
            role="listitem"
            className="chat-connectors-row"
            style={
              isSettings ? undefined : { animationDelay: `${(items.length - 1 - index) * 55}ms` }
            }
          >
            <div className="chat-connectors-row__main">
              <span className="chat-connectors-row__icon">
                <Logo />
              </span>
              <span className="chat-connectors-row__label">{label}</span>
            </div>

            {locked ? (
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
              <button
                type="button"
                className="chat-connectors-row__connect"
                onClick={() => onConnect(id)}
                disabled={connecting}
              >
                {connecting ? "Connexion…" : "Connecter"}
                {!connecting && (
                  <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                )}
              </button>
            ) : connected ? (
              <button
                type="button"
                className="chat-connectors-row__slash"
                title={`Insert ${slash}`}
                onClick={() => onInsertSlash(slash)}
              >
                use <span className="chat-connectors-row__slash-cmd">{slash}</span>
              </button>
            ) : (
              <button
                type="button"
                className="chat-connectors-row__connect"
                onClick={() => onConnect(id)}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect"}
                {!connecting && (
                  <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
