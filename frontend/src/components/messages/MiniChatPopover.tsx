import { useState } from "react";
import clsx from "clsx";
import { Send, X } from "lucide-react";
import type { PeopleMessage } from "../../lib/peopleChat";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import { usePeopleStore } from "../../store/usePeopleStore";

const EMPTY_MESSAGES: PeopleMessage[] = [];

export default function MiniChatPopover() {
  const open = useMiniChatStore((s) => s.open);
  const threadId = useMiniChatStore((s) => s.threadId);
  const personName = useMiniChatStore((s) => s.personName);
  const close = useMiniChatStore((s) => s.close);
  const thread = usePeopleStore((s) => (threadId ? s.threadById(threadId) : undefined));
  const messages = usePeopleStore((s) => {
    if (!threadId) return EMPTY_MESSAGES;
    for (const item of s.friendThreads) {
      if (item.id === threadId) return item.messages;
    }
    for (const threads of Object.values(s.colleagueThreadsByWorkspace)) {
      const found = threads.find((item) => item.id === threadId);
      if (found) return found.messages;
    }
    return EMPTY_MESSAGES;
  });
  const sendMessage = usePeopleStore((s) => s.sendMessage);
  const [draft, setDraft] = useState("");

  if (!open || !threadId || !thread) return null;

  return (
    <>
      <button
        type="button"
        className="mini-chat__backdrop"
        aria-label="Fermer le mini chat"
        onClick={close}
      />
      <div className="mini-chat" role="dialog" aria-label={`Message à ${personName}`}>
        <div className="mini-chat__header">
          <h3 className="mini-chat__title">{personName}</h3>
          <button
            type="button"
            className="mini-chat__close"
            onClick={close}
            aria-label="Fermer"
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        <ul className="mini-chat__thread">
          {messages.length === 0 ? (
            <li className="mini-chat__empty">Dites bonjour à {personName}.</li>
          ) : (
            messages.map((msg) => (
              <li
                key={msg.id}
                className={clsx(
                  "mini-chat__bubble-row",
                  msg.mine && "mini-chat__bubble-row--mine",
                )}
              >
                <div
                  className={clsx(
                    "mini-chat__bubble",
                    msg.mine && "mini-chat__bubble--mine",
                  )}
                >
                  {!msg.mine && (
                    <span className="mini-chat__bubble-author">{msg.author}</span>
                  )}
                  <p>{msg.text}</p>
                </div>
              </li>
            ))
          )}
        </ul>

        <form
          className="mini-chat__compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            sendMessage(thread.id, draft);
            setDraft("");
          }}
        >
          <input
            type="text"
            className="mini-chat__input"
            placeholder="Écrire un message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="mini-chat__send"
            disabled={!draft.trim()}
            aria-label="Envoyer"
          >
            <Send size={14} aria-hidden />
          </button>
        </form>
      </div>
    </>
  );
}
