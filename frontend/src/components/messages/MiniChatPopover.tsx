import { useState } from "react";
import { Send, X } from "lucide-react";
import type { PeopleMessage } from "../../lib/peopleChat";
import { resolvePersonPhotoURL } from "../../lib/peopleChat";
import { useStore } from "../../store/useStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import UserAvatar from "../UserAvatar";
import PeopleChatThreadMessages from "../chat/PeopleChatThreadMessages";

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
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const [draft, setDraft] = useState("");

  if (!open || !threadId || !thread) return null;

  const partnerPhotoURL = resolvePersonPhotoURL(thread.personId, membersByWorkspace, {
    preferredWorkspaceId: activeRoomId,
    photoCache: personPhotoByUserId,
  });

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
          <UserAvatar
            userId={thread.personId}
            name={personName}
            photoURL={partnerPhotoURL}
            className="mini-chat__header-avatar"
          />
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

        {messages.length === 0 ? (
          <p className="mini-chat__empty">Dites bonjour à {personName}.</p>
        ) : (
          <PeopleChatThreadMessages
            partnerName={personName}
            partnerId={thread.personId}
            partnerPhotoURL={partnerPhotoURL}
            messages={messages}
            className="mini-chat__thread"
            compact
          />
        )}

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
