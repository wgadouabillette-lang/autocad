import { useState } from "react";
import clsx from "clsx";
import { Send } from "lucide-react";
import { useTheaterChatStore, type TheaterChatMessage } from "../../store/useTheaterChatStore";
import { useStore } from "../../store/useStore";

const EMPTY_MESSAGES: TheaterChatMessage[] = [];

export default function TheaterChatPanel() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const messages = useTheaterChatStore((s) => s.messagesByWorkspace[activeRoomId] ?? EMPTY_MESSAGES);
  const sendMessage = useTheaterChatStore((s) => s.sendMessage);
  const [draft, setDraft] = useState("");

  return (
    <div className="theater-chat-panel">
      <ul className="theater-chat-panel__thread">
        {messages.length === 0 ? (
          <li className="theater-chat-panel__empty">
            Posez votre question ici — les intervenants la verront pendant le théâtre vocal.
          </li>
        ) : (
          messages.map((msg) => (
            <li
              key={msg.id}
              className={clsx(
                "messages-overlay__bubble-row",
                msg.mine && "messages-overlay__bubble-row--mine",
              )}
            >
              <div
                className={clsx(
                  "messages-overlay__bubble",
                  msg.mine && "messages-overlay__bubble--mine",
                )}
              >
                {!msg.mine && (
                  <span className="messages-overlay__bubble-author">{msg.author}</span>
                )}
                <p>{msg.text}</p>
              </div>
            </li>
          ))
        )}
      </ul>

      <form
        className="messages-overlay__compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          sendMessage(activeRoomId, draft);
          setDraft("");
        }}
      >
        <input
          type="text"
          className="messages-overlay__input"
          placeholder="Votre question…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="messages-overlay__send"
          disabled={!draft.trim()}
          aria-label="Envoyer"
        >
          <Send size={14} aria-hidden />
        </button>
      </form>
    </div>
  );
}
