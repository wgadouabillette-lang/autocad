import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import ChatConnectorsList from "../chat/ChatConnectorsList";
import type { ChatConnectorId } from "../chat/chatConnectors";

const PREVIEW_CONNECTED: ReadonlySet<ChatConnectorId> = new Set([
  "calendar",
  "spotify",
  "gmail",
]);

/** Panel popup is 420ms; cascade starts shortly after it finishes. */
const CASCADE_DELAY_MS = 480;

interface ConnectorsNotificationVisualProps {
  replayKey: string | number;
}

export default function ConnectorsNotificationVisual({
  replayKey,
}: ConnectorsNotificationVisualProps) {
  const connectedIds = useMemo(() => PREVIEW_CONNECTED, []);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setAnimating(false);
    const timeoutId = window.setTimeout(() => setAnimating(true), CASCADE_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [replayKey]);

  return (
    <div
      className={clsx(
        "notifications-panel__connectors-cascade",
        animating && "notifications-panel__connectors-cascade--animating",
      )}
    >
      <div className="chat-panel-footer notifications-panel__connectors-cascade-footer">
        <div className="chat-panel-footer__inner">
          <div className="chat-connectors-stage chat-connectors-stage--footer">
            <ChatConnectorsList
              connectedIds={connectedIds}
              locked
              onConnect={() => {}}
              onInsertSlash={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
