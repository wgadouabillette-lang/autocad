import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { ArrowUp, FileImage, Paperclip, Smile, X } from "lucide-react";
import type { PeopleMessage, Person } from "../../lib/peopleChat";
import { buildMessagePanelThreads, resolvePersonPhotoURL } from "../../lib/peopleChat";
import { useAuthStore } from "../../store/useAuthStore";
import { useCallsStore } from "../../store/useCallsStore";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";
import { useWorkspacePresenceStore } from "../../store/useWorkspacePresenceStore";
import UserAvatar from "../UserAvatar";
import PeopleChatEmojiPicker from "./PeopleChatEmojiPicker";
import PeopleChatThreadMessages from "./PeopleChatThreadMessages";

const EMPTY_MESSAGES: PeopleMessage[] = [];

const CHAT_COMPOSER_SURFACE_STYLE: CSSProperties = {
  backgroundColor: "var(--forma-chat-composer-bg)",
  border: "1px solid var(--forma-chat-composer-stroke)",
};

interface ComposerAttachment {
  id: string;
  file: File;
  isImage: boolean;
  previewUrl: string;
}

function buildAttachment(file: File): ComposerAttachment {
  const isImage = file.type.startsWith("image/");
  return {
    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    isImage,
    previewUrl: isImage ? URL.createObjectURL(file) : "",
  };
}

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default function FriendsChatPanel() {
  const friendThreads = usePeopleStore((s) => s.friendThreadsList());
  const friends = usePeopleStore((s) => s.friends);
  const activeRoomId = useStore((s) => s.activeRoomId);
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const colleagueThreads = usePeopleStore((s) =>
    s.colleagueThreadsForWorkspace(activeRoomId),
  );
  const roomBlocks = useCallsStore((s) => s.callsByRoom[activeRoomId]?.blocks);
  const presenceMembers = useWorkspacePresenceStore(
    (s) => s.membersByWorkspace[activeRoomId],
  );
  const membersByWorkspace = useWorkspacePresenceStore((s) => s.membersByWorkspace);
  const personPhotoByUserId = usePeopleStore((s) => s.personPhotoByUserId);
  const hydratePersonPhotos = usePeopleStore((s) => s.hydratePersonPhotos);
  const ensureColleagueThread = usePeopleStore((s) => s.ensureColleagueThread);
  const ensureFriendThread = usePeopleStore((s) => s.ensureFriendThread);
  const sendMessage = usePeopleStore((s) => s.sendMessage);
  const markThreadRead = usePeopleStore((s) => s.markThreadRead);
  const markFriendsTabSeen = usePeopleStore((s) => s.markFriendsTabSeen);
  const setActiveFriendThread = usePeopleStore((s) => s.setActiveFriendThread);
  const selectedThreadId = usePeopleStore((s) => s.activeFriendThreadId);
  const thread = usePeopleStore((s) =>
    selectedThreadId ? s.threadById(selectedThreadId) : undefined,
  );
  const messages = usePeopleStore((s) => {
    if (!selectedThreadId) return EMPTY_MESSAGES;
    for (const item of s.friendThreads) {
      if (item.id === selectedThreadId) return item.messages;
    }
    for (const threads of Object.values(s.colleagueThreadsByWorkspace)) {
      const found = threads.find((item) => item.id === selectedThreadId);
      if (found) return found.messages;
    }
    return EMPTY_MESSAGES;
  });

  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
    };
  }, [attachments]);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = Array.from(files).map(buildAttachment);
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((att) => att.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((att) => att.id !== id);
    });
  };

  const workspaceMemberPeople = useMemo(() => {
    const seen = new Set<string>();
    const out: Person[] = [];
    const push = (id: string, name: string) => {
      if (!id || id === "local" || (firebaseUid && id === firebaseUid) || seen.has(id)) return;
      seen.add(id);
      out.push({ id, name: name.trim() || "Member", handle: id });
    };

    if (presenceMembers) {
      for (const [uid, entry] of Object.entries(presenceMembers)) {
        push(uid, entry.displayName);
      }
    }

    for (const block of roomBlocks ?? []) {
      for (const participant of block.participants) {
        if (!participant.isLocal) {
          push(participant.id, participant.name);
        }
      }
    }

    return out;
  }, [presenceMembers, roomBlocks, firebaseUid]);

  const combinedThreads = useMemo(
    () =>
      buildMessagePanelThreads({
        workspaceId: activeRoomId,
        friends,
        friendThreads,
        colleagueThreads,
        workspaceMembers: workspaceMemberPeople,
        localUserId: firebaseUid,
      }),
    [
      activeRoomId,
      friends,
      friendThreads,
      colleagueThreads,
      workspaceMemberPeople,
      firebaseUid,
    ],
  );

  const photoLookup = useMemo(
    () => ({ preferredWorkspaceId: activeRoomId, photoCache: personPhotoByUserId }),
    [activeRoomId, personPhotoByUserId],
  );

  useEffect(() => {
    const personIds = combinedThreads.map((item) => item.personId);
    if (thread) personIds.push(thread.personId);
    void hydratePersonPhotos([...new Set(personIds)]);
  }, [combinedThreads, thread, hydratePersonPhotos]);

  useEffect(() => {
    markFriendsTabSeen();
  }, [markFriendsTabSeen]);

  useEffect(() => {
    return () => {
      setActiveFriendThread(null);
    };
  }, [setActiveFriendThread]);

  useEffect(() => {
    if (selectedThreadId) {
      markThreadRead(selectedThreadId);
      setDraft("");
      setEmojiPickerOpen(false);
      setAttachments((prev) => {
        prev.forEach((att) => {
          if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
        });
        return [];
      });
    }
  }, [selectedThreadId, markThreadRead]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, selectedThreadId]);

  const openThread = (item: (typeof combinedThreads)[number]) => {
    const threadId =
      item.section === "friends"
        ? ensureFriendThread({
            id: item.personId,
            name: item.personName,
            handle: item.personId,
          })
        : ensureColleagueThread(activeRoomId, item.personId, item.personName);
    setActiveFriendThread(threadId);
  };

  const submit = () => {
    if (!thread) return;
    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;
    if (trimmed) sendMessage(thread.id, trimmed);
    setDraft("");
    setAttachments((prev) => {
      prev.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      });
      return [];
    });
    textareaRef.current?.focus();
  };

  const handleEmojiSelect = (emoji: string) => {
    setDraft((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  if (thread) {
    const partnerPhotoURL = resolvePersonPhotoURL(thread.personId, membersByWorkspace, photoLookup);
    const canSubmit = draft.trim().length > 0 || attachments.length > 0;
    return (
      <div className="chat-panel-layout relative overflow-hidden">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <PeopleChatThreadMessages
            partnerName={thread.personName}
            partnerId={thread.personId}
            partnerPhotoURL={partnerPhotoURL}
            messages={messages}
            listRef={messagesScrollRef}
            className="chat-messages-scroll min-h-0 flex-1"
          />
        </div>

        <div
          className={clsx(
            "chat-panel-footer pointer-events-none shrink-0 px-3 pb-3 pt-0",
            emojiPickerOpen && "chat-panel-footer--poll-morph",
          )}
        >
          <form
            className="pointer-events-auto relative"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div
              className={clsx(
                "relative",
                emojiPickerOpen && "chat-composer chat-composer-morph rounded-xl",
                !emojiPickerOpen && "chat-composer z-10 flex flex-col gap-1 rounded-xl px-2 py-1.5",
              )}
              style={CHAT_COMPOSER_SURFACE_STYLE}
            >
              {emojiPickerOpen ? (
                <PeopleChatEmojiPicker
                  onSelect={handleEmojiSelect}
                  onClose={() => setEmojiPickerOpen(false)}
                />
              ) : (
                <>
              {attachments.length > 0 && (
                <div className="flex h-8 items-center gap-1 overflow-hidden">
                  {attachments.map((att, i) => (
                    <div
                      key={att.id}
                      className={clsx(
                        "group relative h-7 w-7 shrink-0 overflow-hidden",
                        i === 0 && "rounded-tl-md",
                      )}
                      title={att.file.name}
                    >
                      {att.isImage ? (
                        <img src={att.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-muted-500">
                          <FileImage size={14} strokeWidth={1.5} />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="absolute inset-0 flex items-center justify-center bg-ink-900/55 text-muted-100 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remove attachment"
                      >
                        <X size={12} strokeWidth={2.5} aria-hidden />
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
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder={`Write to ${thread.personName}…`}
                className="min-h-[24px] max-h-[160px] w-full resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-tight text-muted-100 outline-none placeholder:text-muted-500"
              />
              <div className="flex h-[24px] items-center gap-2">
                <button
                  type="button"
                  title="Add attachment"
                  aria-label="Add attachment"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent text-muted-400 transition-colors hover:text-muted-200"
                >
                  <Paperclip size={14} strokeWidth={2.25} aria-hidden />
                </button>

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEmojiPickerOpen(true)}
                    title="Add emoji"
                    aria-label="Add emoji"
                    className="inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent text-muted-400 transition-colors hover:text-muted-200"
                  >
                    <Smile size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    title="Send"
                    aria-label="Send"
                    className={clsx(
                      "inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-750 text-muted-200 transition-colors hover:bg-ink-700 disabled:opacity-30",
                    )}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
                  </button>
                </div>
              </div>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="friends-chat-panel">
      {combinedThreads.length === 0 ? (
        <p className="friends-chat-panel__empty">
          No contacts yet. Add friends by email in settings or join a workspace with other members.
        </p>
      ) : (
        <ul className="friends-chat-panel__list">
          {combinedThreads.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={clsx(
                  "messages-overlay__thread-row",
                  item.unread > 0 && "messages-overlay__thread-row--unread",
                )}
                onClick={() => openThread(item)}
              >
                <UserAvatar
                  userId={item.personId}
                  name={item.personName}
                  photoURL={resolvePersonPhotoURL(item.personId, membersByWorkspace, photoLookup)}
                  className="messages-overlay__avatar"
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="messages-overlay__thread-name">{item.personName}</span>
                  <span className="messages-overlay__thread-preview">
                    {item.preview ||
                      (item.section === "friends" ? "Friend · New conversation" : "Workspace member")}
                  </span>
                </span>
                <span className="messages-overlay__thread-meta">
                  {item.messages.length > 0 && <time>{formatWhen(item.updatedAt)}</time>}
                  {item.unread > 0 && (
                    <span className="messages-overlay__unread">{item.unread}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
