import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowUp, FileImage, Mic, Paperclip, X } from "lucide-react";
import { avatarColor, userInitials } from "../../lib/calls";
import type { PeopleMessage } from "../../lib/peopleChat";
import { usePeopleStore } from "../../store/usePeopleStore";
import { useStore } from "../../store/useStore";

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const CHAT_COMPOSER_SURFACE_STYLE: CSSProperties = {
  backgroundColor: "var(--forma-chat-composer-bg)",
  border: "1px solid var(--forma-chat-composer-stroke)",
};

const EMPTY_MESSAGES: PeopleMessage[] = [];

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
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

export default function FriendsChatPanel() {
  const friendThreads = usePeopleStore((s) => s.friendThreadsList());
  const activeRoomId = useStore((s) => s.activeRoomId);
  const colleagueThreads = usePeopleStore((s) =>
    s.colleagueThreadsForWorkspace(activeRoomId),
  );
  const sendMessage = usePeopleStore((s) => s.sendMessage);
  const markThreadRead = usePeopleStore((s) => s.markThreadRead);
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
  const [isDictating, setIsDictating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLUListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const dictationBaseRef = useRef<string>("");
  const speechSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  const stopDictation = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    setIsDictating(false);
  }, []);

  const startDictation = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "fr-FR";
    dictationBaseRef.current = draft;
    rec.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (finalText) {
        const base = dictationBaseRef.current;
        const joined = base ? `${base.trimEnd()} ${finalText.trim()}` : finalText.trim();
        dictationBaseRef.current = joined;
        setDraft(joined);
      } else if (interim) {
        const base = dictationBaseRef.current;
        const preview = base ? `${base.trimEnd()} ${interim}` : interim;
        setDraft(preview);
      }
    };
    rec.onerror = () => {
      stopDictation();
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setIsDictating(false);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setIsDictating(true);
    } catch {
      recognitionRef.current = null;
      setIsDictating(false);
    }
  }, [draft, stopDictation]);

  useEffect(() => {
    return () => {
      stopDictation();
    };
  }, [stopDictation]);

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

  const combinedThreads = useMemo(() => {
    return [...colleagueThreads, ...friendThreads].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [friendThreads, colleagueThreads]);

  useEffect(() => {
    return () => {
      setActiveFriendThread(null);
    };
  }, [setActiveFriendThread]);

  useEffect(() => {
    if (selectedThreadId) {
      markThreadRead(selectedThreadId);
      setDraft("");
      setAttachments((prev) => {
        prev.forEach((att) => {
          if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
        });
        return [];
      });
      stopDictation();
    }
  }, [selectedThreadId, markThreadRead, stopDictation]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, selectedThreadId]);

  const openThread = (id: string) => {
    setActiveFriendThread(id);
  };

  const submit = () => {
    if (!thread) return;
    const trimmed = draft.trim();
    if (!trimmed && attachments.length === 0) return;
    stopDictation();
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

  if (thread) {
    const canSubmit = draft.trim().length > 0 || attachments.length > 0;
    return (
      <div className="chat-panel-layout relative overflow-hidden">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="friends-chat-panel__thread-header shrink-0">
            <button
              type="button"
              className="friends-chat-panel__back"
              onClick={() => setActiveFriendThread(null)}
              aria-label="Retour"
            >
              <ArrowLeft size={14} aria-hidden />
            </button>
            <span className="friends-chat-panel__thread-name">{thread.personName}</span>
          </div>

          <ul
            ref={messagesScrollRef}
            className="chat-messages-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
          >
            {messages.map((msg) => (
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
            ))}
          </ul>
        </div>

        <div className="chat-panel-footer pointer-events-none shrink-0 px-3 pb-3 pt-0">
          <form
            className="pointer-events-auto relative"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div
              className="chat-composer relative z-10 flex flex-col gap-1 rounded-xl px-2 py-1.5"
              style={CHAT_COMPOSER_SURFACE_STYLE}
            >
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
                        aria-label="Retirer la pièce jointe"
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
                placeholder={`Écrire à ${thread.personName}…`}
                className="min-h-[24px] max-h-[160px] w-full resize-none border-0 bg-transparent px-1 py-1 text-[12px] leading-tight text-muted-100 outline-none placeholder:text-muted-500"
              />
              <div className="flex h-[24px] items-center gap-2">
                <button
                  type="button"
                  className="chat-apps-capsule"
                  title="Ajouter une pièce jointe"
                  aria-label="Ajouter une pièce jointe"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="chat-apps-stack">
                    <span
                      className="chat-app-circle pointer-events-none"
                      aria-hidden
                    >
                      <Paperclip size={11} strokeWidth={2.25} />
                    </span>
                  </span>
                </button>

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => (isDictating ? stopDictation() : startDictation())}
                    disabled={!speechSupported}
                    aria-pressed={isDictating}
                    title={
                      !speechSupported
                        ? "Dictée vocale non disponible sur cet appareil"
                        : isDictating
                          ? "Arrêter la dictée"
                          : "Dicter le message"
                    }
                    aria-label={isDictating ? "Arrêter la dictée" : "Dicter le message"}
                    className={clsx(
                      "inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-transparent transition-colors disabled:opacity-30",
                      isDictating
                        ? "text-red-400 hover:text-red-300"
                        : "text-muted-400 hover:text-muted-200",
                    )}
                  >
                    <Mic size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    title="Envoyer"
                    aria-label="Envoyer"
                    className={clsx(
                      "inline-flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border border-ink-600 bg-ink-750 text-muted-200 transition-colors hover:bg-ink-700 disabled:opacity-30",
                    )}
                  >
                    <ArrowUp size={14} strokeWidth={2.5} className="shrink-0" aria-hidden />
                  </button>
                </div>
              </div>
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
          Aucune conversation pour l&apos;instant. Ajoutez un ami par email dans les paramètres
          pour démarrer un chat.
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
                onClick={() => openThread(item.id)}
              >
                <span
                  className="messages-overlay__avatar"
                  style={{ backgroundColor: avatarColor(item.personId) }}
                >
                  {userInitials(item.personName)}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="messages-overlay__thread-name">{item.personName}</span>
                  <span className="messages-overlay__thread-preview">{item.preview}</span>
                </span>
                <span className="messages-overlay__thread-meta">
                  <time>{formatWhen(item.updatedAt)}</time>
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
