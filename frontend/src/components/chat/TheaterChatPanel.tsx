import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { ArrowUp, FileImage, Plus, X } from "lucide-react";
import {
  useTheaterChatStore,
  type TheaterChatAttachment,
  type TheaterChatMessage,
} from "../../store/useTheaterChatStore";
import { useStore } from "../../store/useStore";
import { useVoicePollStore } from "../../store/useVoicePollStore";
import { useActiveVoicePoll } from "../../hooks/useActiveVoicePoll";
import ChatPollComposer from "./ChatPollComposer";
import ChatPollVotePanel from "./ChatPollVotePanel";
import HighlightedPromptInput from "./HighlightedPromptInput";
import UserAvatar from "../UserAvatar";
import {
  isTheaterHandRaiseNotice,
  theaterHandRaiseNoticeText,
} from "../../lib/theaterChatMessages";

const EMPTY_MESSAGES: TheaterChatMessage[] = [];

const CHAT_COMPOSER_SURFACE_STYLE: CSSProperties = {
  backgroundColor: "var(--forma-chat-composer-bg)",
  border: "1px solid var(--forma-chat-composer-stroke)",
};

interface ComposerAttachment {
  id: string;
  file: File;
  previewUrl: string;
  isImage: boolean;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

interface TheaterChatGroup {
  key: string;
  mine: boolean;
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  messages: TheaterChatMessage[];
  handRaise?: boolean;
}

function buildTheaterChatGroups(messages: TheaterChatMessage[]): TheaterChatGroup[] {
  const groups: TheaterChatGroup[] = [];
  for (const message of messages) {
    if (isTheaterHandRaiseNotice(message)) {
      groups.push({
        key: message.id,
        mine: !!message.mine,
        authorId: message.authorId,
        authorName: message.author,
        authorPhotoURL: message.authorPhotoURL ?? null,
        messages: [message],
        handRaise: true,
      });
      continue;
    }

    const last = groups[groups.length - 1];
    const sameAuthor =
      last && last.authorId === message.authorId && last.mine === !!message.mine;
    if (sameAuthor) {
      last.messages.push(message);
    } else {
      groups.push({
        key: message.id,
        mine: !!message.mine,
        authorId: message.authorId,
        authorName: message.author,
        authorPhotoURL: message.authorPhotoURL ?? null,
        messages: [message],
      });
    }
  }
  return groups;
}

function TheaterChatAttachments({ attachments }: { attachments: TheaterChatAttachment[] }) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) =>
        attachment.isImage ? (
          <img
            key={attachment.id}
            src={attachment.url}
            alt={attachment.name}
            className="max-h-40 max-w-full rounded-md object-cover"
          />
        ) : (
          <span
            key={attachment.id}
            className="inline-flex items-center gap-1 rounded-md border border-ink-700 bg-ink-800/80 px-2 py-1 text-[11px] text-muted-300"
          >
            <FileImage size={12} strokeWidth={1.5} aria-hidden />
            <span className="max-w-[12rem] truncate">{attachment.name}</span>
          </span>
        ),
      )}
    </div>
  );
}

function TheaterChatBubble({
  message,
  mine,
  isFirstInGroup,
  isLastInGroup,
}: {
  message: TheaterChatMessage;
  mine: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}) {
  if (isTheaterHandRaiseNotice(message)) {
    return (
      <p className="theater-chat-hand-raise-notice">{theaterHandRaiseNoticeText(message)}</p>
    );
  }

  const attachments = message.attachments ?? [];

  return (
    <div
      className={clsx(
        "people-chat-bubble",
        mine ? "people-chat-bubble--outgoing" : "people-chat-bubble--incoming",
        isFirstInGroup && "people-chat-bubble--first",
        isLastInGroup && "people-chat-bubble--last",
      )}
    >
      {message.text ? <p className="people-chat-bubble__text">{message.text}</p> : null}
      <TheaterChatAttachments attachments={attachments} />
    </div>
  );
}

export default function TheaterChatPanel() {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const messages = useTheaterChatStore((s) => s.messagesByWorkspace[activeRoomId] ?? EMPTY_MESSAGES);
  const sendMessage = useTheaterChatStore((s) => s.sendMessage);
  const pollComposerOpen = useVoicePollStore(
    (s) => s.composerOpenByWorkspace[activeRoomId] ?? false,
  );
  const pollVoteOpenRaw = useVoicePollStore(
    (s) => s.votePanelOpenByWorkspace[activeRoomId] ?? false,
  );
  const activePoll = useActiveVoicePoll(activeRoomId);
  const pollVoteOpen = pollVoteOpenRaw && !!activePoll;
  const groups = useMemo(() => buildTheaterChatGroups(messages), [messages]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLLIElement>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl);
      });
    };
  }, []);

  const scrollToLatest = useCallback(() => {
    const scrollEl = messagesScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({
      top: scrollEl.scrollHeight - scrollEl.clientHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToLatest());
    });
    return () => cancelAnimationFrame(id);
  }, [messages, scrollToLatest]);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: ComposerAttachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      next.push({
        id: `att-${Date.now()}-${i}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isImage: isImageFile(file),
      });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 8));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const item = prev.find((attachment) => attachment.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((attachment) => attachment.id !== id);
    });
  };

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;

    const messageAttachments: TheaterChatAttachment[] = attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.file.name,
      url: URL.createObjectURL(attachment.file),
      isImage: attachment.isImage,
    }));

    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    sendMessage(activeRoomId, trimmed, messageAttachments);
    setDraft("");
    setAttachments([]);
  };

  const canSubmit = draft.trim().length > 0 || attachments.length > 0;

  return (
    <div className="chat-panel-layout relative overflow-hidden">
      <div
        ref={messagesScrollRef}
        className="chat-messages-scroll relative min-h-0 overflow-y-auto overflow-x-hidden px-3 pb-0"
      >
        <ul className="theater-chat-thread">
          <li className="theater-chat-thread__spacer" aria-hidden />
          {groups.map((group) =>
            group.handRaise ? (
              <li key={group.key} className="theater-chat-thread__hand-raise">
                <TheaterChatBubble
                  message={group.messages[0]!}
                  mine={group.mine}
                  isFirstInGroup
                  isLastInGroup
                />
              </li>
            ) : (
              <li
                key={group.key}
                className={clsx(
                  "theater-chat-thread__group",
                  group.mine
                    ? "theater-chat-thread__group--mine"
                    : "theater-chat-thread__group--theirs",
                )}
              >
                <div className="theater-chat-thread__bubbles">
                  {group.messages.map((message, idx) => (
                    <TheaterChatBubble
                      key={message.id}
                      message={message}
                      mine={group.mine}
                      isFirstInGroup={idx === 0}
                      isLastInGroup={idx === group.messages.length - 1}
                    />
                  ))}
                </div>

                {!group.mine && (
                  <div
                    className="theater-chat-thread__author"
                    title={group.authorName}
                  >
                    <UserAvatar
                      userId={group.authorId}
                      name={group.authorName}
                      photoURL={group.authorPhotoURL}
                      className="theater-chat-thread__avatar"
                    />
                    <span className="theater-chat-thread__author-name">
                      {group.authorName}
                    </span>
                  </div>
                )}
              </li>
            ),
          )}
          <li ref={messagesEndRef} className="theater-chat-thread__tail" aria-hidden />
        </ul>
      </div>

      <div className="chat-panel-footer pointer-events-none shrink-0 px-3 pb-3 pt-0">
        <div className="pointer-events-auto relative">
          {pollComposerOpen ? (
            <div
              className="chat-composer chat-composer-morph relative z-10 rounded-xl"
              style={CHAT_COMPOSER_SURFACE_STYLE}
            >
              <ChatPollComposer />
            </div>
          ) : pollVoteOpen ? (
            <div
              className="chat-composer chat-composer-morph relative z-10 rounded-xl"
              style={CHAT_COMPOSER_SURFACE_STYLE}
            >
              <ChatPollVotePanel />
            </div>
          ) : (
          <div
            className="chat-composer relative z-10 flex flex-col gap-1 rounded-xl px-2 py-1.5"
            style={CHAT_COMPOSER_SURFACE_STYLE}
          >
            {attachments.length > 0 && (
              <div className="flex h-8 items-center gap-1 overflow-hidden">
                {attachments.map((attachment, index) => (
                  <div
                    key={attachment.id}
                    className={clsx(
                      "group relative h-7 w-7 shrink-0 overflow-hidden",
                      index === 0 && "rounded-tl-md",
                    )}
                    title={attachment.file.name}
                  >
                    {attachment.isImage ? (
                      <img
                        src={attachment.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-500">
                        <FileImage size={14} strokeWidth={1.5} />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute inset-0 flex items-center justify-center bg-ink-900/55 text-muted-100 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Retirer la pièce jointe"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <div className={clsx("relative", attachments.length > 0 && "mt-1.5")}>
              <HighlightedPromptInput
                ref={textareaRef}
                value={draft}
                placeholder="Écrire dans le chat du théâtre…"
                peopleHandles={[]}
                onChange={setDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
            </div>

            <div className="flex h-[24px] items-center gap-2">
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Joindre un fichier"
                  aria-label="Joindre un fichier"
                  className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent text-muted-400 transition-colors hover:text-muted-200"
                >
                  <Plus size={15} strokeWidth={2.5} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  title="Envoyer"
                  aria-label="Envoyer"
                  className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-750 text-muted-200 transition-colors hover:bg-ink-700 disabled:opacity-30"
                >
                  <ArrowUp size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
