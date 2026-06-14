import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { VOICE_POLL_OPTION_COUNT } from "../../lib/voicePoll";
import { useVoicePollStore } from "../../store/useVoicePollStore";
import { useStore } from "../../store/useStore";

interface PollOptionDraft {
  id: string;
  value: string;
}

function createEmptyOptions(): PollOptionDraft[] {
  return Array.from({ length: VOICE_POLL_OPTION_COUNT }, (_, index) => ({
    id: `poll-opt-${index}-${Math.random().toString(36).slice(2, 7)}`,
    value: "",
  }));
}

export default function ChatPollComposer() {
  const workspaceId = useStore((s) => s.activeRoomId);
  const closeComposer = useVoicePollStore((s) => s.closeComposer);
  const publishPoll = useVoicePollStore((s) => s.publishPoll);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [options, setOptions] = useState(createEmptyOptions);
  const [error, setError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const draggingIndexRef = useRef<number | null>(null);

  const updateOption = (index: number, value: string) => {
    setOptions((current) =>
      current.map((entry, i) => (i === index ? { ...entry, value } : entry)),
    );
  };

  const reorderOption = useCallback((from: number, to: number) => {
    if (from === to) return;
    setOptions((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    draggingIndexRef.current = to;
    setDraggingIndex(to);
  }, []);

  const resolveTargetIndex = useCallback((clientY: number) => {
    const list = optionsListRef.current;
    if (!list) return 0;
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-poll-option-row]"));
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return Math.max(0, rows.length - 1);
  }, []);

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const from = draggingIndexRef.current;
      if (from === null) return;
      const target = resolveTargetIndex(event.clientY);
      if (target !== from) reorderOption(from, target);
    },
    [reorderOption, resolveTargetIndex],
  );

  const endDrag = useCallback(() => {
    draggingIndexRef.current = null;
    setDraggingIndex(null);
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [handleWindowPointerMove]);

  const startDrag = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    draggingIndexRef.current = index;
    setDraggingIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  useEffect(() => () => endDrag(), [endDrag]);

  const handlePublish = () => {
    const result = publishPoll(
      workspaceId,
      title,
      subtitle,
      options.map((option) => option.value),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle("");
    setSubtitle("");
    setOptions(createEmptyOptions());
    setError(null);
  };

  return (
    <div className="chat-poll-composer" aria-label="Créer un sondage">
      <button
        type="button"
        className="chat-poll-composer__close"
        onClick={() => closeComposer(workspaceId)}
        aria-label="Fermer"
      >
        <X size={18} aria-hidden />
      </button>

      <div className="chat-poll-composer__body">
        <input
          className="chat-poll-composer__field chat-poll-composer__field--title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What should we decide?"
        />
        <input
          className="chat-poll-composer__field chat-poll-composer__field--subtitle"
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          placeholder="Add context for the group"
        />

        <div ref={optionsListRef} className="chat-poll-composer__options">
          {options.map((option, index) => (
            <div
              key={option.id}
              data-poll-option-row
              className="chat-poll-composer__option-row chat-connectors-row__connect"
              data-dragging={draggingIndex === index ? "true" : undefined}
            >
              <input
                className="chat-poll-composer__option-input"
                value={option.value}
                onChange={(event) => updateOption(index, event.target.value)}
                placeholder={`Option ${index + 1}`}
              />
              <button
                type="button"
                className="chat-poll-composer__option-drag"
                aria-label={`Réordonner l'option ${index + 1}`}
                onPointerDown={(event) => startDrag(index, event)}
              >
                <span className="chat-poll-composer__option-drag-dot" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        {error && <p className="chat-poll-composer__error">{error}</p>}
      </div>

      <footer className="chat-poll-composer__footer">
        <button type="button" className="chat-poll-composer__publish" onClick={handlePublish}>
          Publish to the group
        </button>
      </footer>
    </div>
  );
}
