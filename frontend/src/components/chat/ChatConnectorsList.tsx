import { ArrowUpRight } from "lucide-react";
import { CHAT_CONNECTORS, type ChatConnectorId } from "./chatConnectors";

export default function ChatConnectorsList({
  connectedIds,
  connectingId = null,
  connectError = null,
  onConnect,
  onInsertSlash,
}: {
  connectedIds: ReadonlySet<ChatConnectorId>;
  connectingId?: ChatConnectorId | null;
  connectError?: string | null;
  onConnect: (id: ChatConnectorId) => void;
  onInsertSlash: (slash: string) => void;
}) {
  const items = CHAT_CONNECTORS;

  return (
    <div
      className="chat-connectors-list chat-connectors-list--from-bottom"
      role="list"
      aria-label="Connectors"
    >
      {connectError && (
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
            style={{ animationDelay: `${(items.length - 1 - index) * 55}ms` }}
          >
            <div className="chat-connectors-row__main">
              <span className="chat-connectors-row__icon">
                <Logo />
              </span>
              <span className="chat-connectors-row__label">{label}</span>
            </div>

            {connected ? (
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
