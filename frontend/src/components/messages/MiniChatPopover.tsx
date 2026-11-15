import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, X } from "lucide-react";
import type { PeopleMessage } from "../../lib/peopleChat";
import { resolvePersonPhotoURL } from "../../lib/peopleChat";
import { resolveChatTypingScopeFromThread } from "../../lib/chatTypingScope";
import { clearChatTypingNow, useChatTyping } from "../../hooks/useChatTyping";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";
import { useMiniChatStore } from "../../store/useMiniChatStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import { usePersonLabel } from "../../lib/participantLabel";
import UserAvatar from "../UserAvatar";
import PeopleChatThreadMessages from "../chat/PeopleChatThreadMessages";
import ChatTypingIndicator from "../chat/ChatTypingIndicator";

const EMPTY_MESSAGES: PeopleMessage[] = [];

export default function MiniChatPopover() {
  const { t } = useTranslation();
  const labelOf = usePersonLabel();
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
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const [draft, setDraft] = useState("");
  const chatTypingScope = useMemo(
    () => resolveChatTypingScopeFromThread(threadId, firebaseUid),
    [threadId, firebaseUid],
  );
  const typingUsers = useChatTyping(chatTypingScope, draft, open && !!threadId);

  if (!open || !threadId || !thread) return null;
  const name = labelOf(personName, false);

  const partnerPhotoURL = resolvePersonPhotoURL(thread.personId, membersByWorkspace, {
    preferredWorkspaceId: activeRoomId,
    photoCache: personPhotoByUserId,
  });

  return (
    <>
      <button
        type="button"
        className="mini-chat__backdrop"
        aria-label={t("chatUi.closeMini")}
        onClick={close}
      />
      <div className="mini-chat" role="dialog" aria-label={t("calls.messageTo", { name })}>
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
            aria-label={t("common.close")}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        {messages.length === 0 ? (
          <p className="mini-chat__empty">{t("chatUi.sayHello", { name })}</p>
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

        <ChatTypingIndicator typers={typingUsers} />

        <form
          className="mini-chat__compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            sendMessage(thread.id, draft);
            clearChatTypingNow(chatTypingScope, firebaseUid);
            setDraft("");
          }}
        >
          <input
            type="text"
            className="mini-chat__input"
            placeholder={t("chatUi.writeMessage")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="mini-chat__send"
            disabled={!draft.trim()}
            aria-label={t("common.send")}
          >
            <Send size={14} aria-hidden />
          </button>
        </form>
      </div>
    </>
  );
}
