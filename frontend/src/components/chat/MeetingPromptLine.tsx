import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MutableRefObject, type Ref } from "react";
import type { MeetingPromptDraft } from "../../lib/meetingSkill";
import HighlightedPromptInput from "./HighlightedPromptInput";

interface MeetingPromptLineProps {
  draft: MeetingPromptDraft;
  onChange?: (draft: MeetingPromptDraft) => void;
  peopleHandles?: string[];
  readOnly?: boolean;
  onDismiss?: () => void;
  attendeesRef?: MutableRefObject<HTMLTextAreaElement | null>;
  onAttendeesSync?: (caret: number) => void;
  onAttendeesKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else (ref as MutableRefObject<T | null>).current = node;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (node: T | null) => {
    for (const ref of refs) assignRef(ref, node);
  };
}

export default function MeetingPromptLine({
  draft,
  onChange,
  peopleHandles = [],
  readOnly = false,
  onDismiss,
  attendeesRef,
  onAttendeesSync,
  onAttendeesKeyDown,
}: MeetingPromptLineProps) {
  const localAttendeesRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (readOnly || draft.attendees !== "@") return;
    const input = attendeesRef?.current ?? localAttendeesRef.current;
    input?.focus();
    input?.setSelectionRange(1, 1);
  }, [readOnly, draft.attendees, attendeesRef]);

  const patch = (partial: Partial<MeetingPromptDraft>) => {
    onChange?.({ ...draft, ...partial });
  };

  return (
    <div className={clsx("meeting-prompt-line", readOnly && "meeting-prompt-line--readonly")}>
      <div className="meeting-prompt-line__header">
        <span className="meeting-prompt-line__slash">/meeting</span>
        {!readOnly && onDismiss ? (
          <button
            type="button"
            className="meeting-prompt-line__dismiss"
            onClick={onDismiss}
            aria-label="Annuler le skill meeting"
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      {readOnly ? (
        <p className="meeting-prompt-line__readonly-title">
          {draft.title.trim() || "Réunion"}
        </p>
      ) : (
        <input
          type="text"
          className="meeting-prompt-line__title"
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="Titre de la réunion"
          aria-label="Titre de la réunion"
        />
      )}

      <div className="meeting-prompt-line__attendees">
        {readOnly ? (
          <p className="meeting-prompt-line__readonly-attendees">{draft.attendees.trim()}</p>
        ) : (
          <HighlightedPromptInput
            ref={mergeRefs(localAttendeesRef, attendeesRef)}
            value={draft.attendees}
            onChange={(value) => {
              patch({ attendees: value });
              const caret = localAttendeesRef.current?.selectionStart ?? value.length;
              onAttendeesSync?.(caret);
            }}
            onClick={() => {
              const caret = localAttendeesRef.current?.selectionStart ?? draft.attendees.length;
              onAttendeesSync?.(caret);
            }}
            onKeyUp={() => {
              const caret = localAttendeesRef.current?.selectionStart ?? draft.attendees.length;
              onAttendeesSync?.(caret);
            }}
            onFocus={() => {
              const caret = localAttendeesRef.current?.selectionStart ?? draft.attendees.length;
              onAttendeesSync?.(caret);
            }}
            onKeyDown={onAttendeesKeyDown}
            peopleHandles={peopleHandles}
            placeholder="Invitez avec @nom"
            className="meeting-prompt-line__attendees-input"
          />
        )}
      </div>

      <div className="meeting-prompt-line__schedule">
        <label className="meeting-prompt-line__field">
          <span className="meeting-prompt-line__label">Journée</span>
          <input
            type="date"
            className="meeting-prompt-line__input"
            value={draft.dateKey}
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(event) => {
              if (event.target.value) patch({ dateKey: event.target.value });
            }}
          />
        </label>
        <label className="meeting-prompt-line__field">
          <span className="meeting-prompt-line__label">Début</span>
          <input
            type="time"
            className="meeting-prompt-line__input"
            value={draft.startTime}
            readOnly={readOnly}
            disabled={readOnly}
            step={300}
            onChange={(event) => patch({ startTime: event.target.value })}
          />
        </label>
        <span className="meeting-prompt-line__sep" aria-hidden>
          →
        </span>
        <label className="meeting-prompt-line__field">
          <span className="meeting-prompt-line__label">Fin</span>
          <input
            type="time"
            className="meeting-prompt-line__input"
            value={draft.endTime}
            readOnly={readOnly}
            disabled={readOnly}
            step={300}
            onChange={(event) => patch({ endTime: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
