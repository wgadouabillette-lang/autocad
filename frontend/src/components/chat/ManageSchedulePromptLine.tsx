import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  MANAGE_DEADLINE_PLACEHOLDER,
  MANAGE_TASK_PLACEHOLDER,
  type ManageSchedulePromptDraft,
} from "../../lib/manageSchedulePrompt";

interface ManagePromptChipProps {
  value: string;
  placeholder: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onBackspaceAtStart?: () => void;
  className?: string;
  inputRef?: (el: HTMLInputElement | null) => void;
}

function ManagePromptChip({
  value,
  placeholder,
  readOnly,
  onChange,
  onBackspaceAtStart,
  className,
  inputRef,
}: ManagePromptChipProps) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const input = localRef.current;
    const pending = pendingSelectionRef.current;
    if (!input || !pending) return;
    pendingSelectionRef.current = null;
    const start = Math.min(pending.start, value.length);
    const end = Math.min(pending.end, value.length);
    input.setSelectionRange(start, end);
  }, [value]);

  if (readOnly) {
    return (
      <span className={clsx("manage-prompt-chip manage-prompt-chip--readonly", className)}>
        {value}
      </span>
    );
  }

  const minWidthCh = Math.max(value.length > 0 ? value.length : placeholder.length, 1);

  return (
    <span className={clsx("manage-prompt-chip", className)}>
      <input
        ref={(el) => {
          localRef.current = el;
          inputRef?.(el);
        }}
        type="text"
        value={value}
        placeholder={placeholder}
        style={{ minWidth: `${minWidthCh}ch` }}
        onChange={(event) => {
          pendingSelectionRef.current = {
            start: event.target.selectionStart ?? event.target.value.length,
            end: event.target.selectionEnd ?? event.target.value.length,
          };
          onChange?.(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Backspace") return;
          const input = event.currentTarget;
          const currentValue = input.value;
          const selectionStart = input.selectionStart ?? 0;
          const selectionEnd = input.selectionEnd ?? 0;
          const hasSelection = selectionStart !== selectionEnd;

          if (hasSelection || (currentValue.length > 0 && selectionStart > 0)) {
            return;
          }

          if (currentValue.length > 0 && selectionStart === 0) {
            return;
          }

          event.preventDefault();
          onBackspaceAtStart?.();
        }}
        className="manage-prompt-chip__input"
        aria-label={placeholder}
      />
    </span>
  );
}

interface ManageSchedulePromptLineProps {
  draft: ManageSchedulePromptDraft;
  onChange?: (draft: ManageSchedulePromptDraft) => void;
  readOnly?: boolean;
  onDismiss?: () => void;
}

export default function ManageSchedulePromptLine({
  draft,
  onChange,
  readOnly = false,
  onDismiss,
}: ManageSchedulePromptLineProps) {
  const taskRefs = useRef<(HTMLInputElement | null)[]>([]);
  const deadlineRef = useRef<HTMLInputElement | null>(null);
  const didAutoFocusRef = useRef(false);

  const focusTask = (index: number) => {
    const input = taskRefs.current[index];
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  };

  const focusDeadline = () => {
    const input = deadlineRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  };

  useEffect(() => {
    if (readOnly || didAutoFocusRef.current) return;
    didAutoFocusRef.current = true;
    const timer = window.setTimeout(() => focusTask(0), 0);
    return () => window.clearTimeout(timer);
  }, [readOnly]);

  const updateTask = (index: number, value: string) => {
    if (!onChange) return;
    const tasks = [...draft.tasks];
    tasks[index] = value;
    onChange({ ...draft, tasks });
  };

  const addTask = () => {
    if (!onChange) return;
    const nextIndex = draft.tasks.length;
    onChange({ ...draft, tasks: [...draft.tasks, ""] });
    requestAnimationFrame(() => focusTask(nextIndex));
  };

  const removeTask = (index: number) => {
    if (!onChange || draft.tasks.length <= 1) return;
    onChange({ ...draft, tasks: draft.tasks.filter((_, i) => i !== index) });
    requestAnimationFrame(() => focusTask(Math.max(0, index - 1)));
  };

  const updateDeadline = (value: string) => {
    onChange?.({ ...draft, deadline: value });
  };

  const handleTaskBackspaceAtStart = (index: number) => {
    const currentValue = draft.tasks[index] ?? "";
    if (currentValue.length > 0) return;

    if (index > 0) {
      removeTask(index);
      return;
    }

    if (draft.tasks.length > 1) {
      removeTask(0);
      return;
    }

    if (draft.deadline.trim()) {
      focusDeadline();
      return;
    }

    onDismiss?.();
  };

  const handleDeadlineBackspaceAtStart = () => {
    if (draft.deadline.length > 0) return;
    focusTask(draft.tasks.length - 1);
  };

  return (
    <div className={clsx("manage-prompt-line", readOnly && "manage-prompt-line--readonly")}>
      <p className="manage-prompt-line__text">
        <span>I need to do </span>
        {draft.tasks.map((task, index) => (
          <span key={`task-${index}`} className="manage-prompt-line__chip-wrap">
            {index > 0 ? <span className="manage-prompt-line__sep">, </span> : null}
            <ManagePromptChip
              value={task}
              placeholder={MANAGE_TASK_PLACEHOLDER}
              readOnly={readOnly}
              onChange={(value) => updateTask(index, value)}
              onBackspaceAtStart={() => handleTaskBackspaceAtStart(index)}
              inputRef={(el) => {
                taskRefs.current[index] = el;
              }}
            />
          </span>
        ))}
        {!readOnly ? (
          <button
            type="button"
            className="manage-prompt-line__add-task"
            onClick={addTask}
            aria-label="Add a task"
          >
            <Plus size={11} aria-hidden />
          </button>
        ) : null}
        <span> before </span>
        <ManagePromptChip
          value={draft.deadline}
          placeholder={MANAGE_DEADLINE_PLACEHOLDER}
          readOnly={readOnly}
          onChange={updateDeadline}
          onBackspaceAtStart={handleDeadlineBackspaceAtStart}
          inputRef={(el) => {
            deadlineRef.current = el;
          }}
        />
        <span>, taking into account my current schedule.</span>
      </p>
    </div>
  );
}
