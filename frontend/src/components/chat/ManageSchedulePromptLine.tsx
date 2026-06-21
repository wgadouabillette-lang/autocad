import clsx from "clsx";
import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MANAGE_DEADLINE_PLACEHOLDER,
  MANAGE_DURATION_PLACEHOLDER,
  MANAGE_TASK_PLACEHOLDER,
  formatTaskDurationInput,
  formatTaskDurationLabel,
  parseDurationMinutes,
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
  const durationRefs = useRef<(HTMLInputElement | null)[]>([]);
  const deadlineRef = useRef<HTMLInputElement | null>(null);
  const didAutoFocusRef = useRef(false);
  const [durationInputs, setDurationInputs] = useState<Record<number, string>>({});

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
    tasks[index] = { ...tasks[index]!, title: value };
    onChange({ ...draft, tasks });
  };

  const updateTaskDuration = (index: number, raw: string) => {
    if (!onChange) return;
    setDurationInputs((prev) => ({ ...prev, [index]: raw }));
    const tasks = [...draft.tasks];
    const durationMinutes = parseDurationMinutes(raw);
    if (raw.trim().length === 0) {
      const { durationMinutes: _removed, ...rest } = tasks[index]!;
      tasks[index] = rest;
    } else if (durationMinutes != null) {
      tasks[index] = { ...tasks[index]!, durationMinutes };
    } else {
      tasks[index] = { ...tasks[index]! };
    }
    onChange({ ...draft, tasks });
  };

  const durationDisplayValue = (index: number) => {
    if (readOnly) {
      return formatTaskDurationLabel(draft.tasks[index]?.durationMinutes);
    }
    if (index in durationInputs) return durationInputs[index]!;
    return formatTaskDurationInput(draft.tasks[index]?.durationMinutes);
  };

  const addTask = () => {
    if (!onChange) return;
    const nextIndex = draft.tasks.length;
    onChange({ ...draft, tasks: [...draft.tasks, { title: "" }] });
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
    const currentValue = draft.tasks[index]?.title ?? "";
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

  const handleDurationBackspaceAtStart = (index: number) => {
    const durationInput = formatTaskDurationInput(draft.tasks[index]?.durationMinutes);
    if (durationInput.length > 0) return;
    focusTask(index);
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
            <span className="manage-prompt-line__task-group">
              <ManagePromptChip
                value={task.title}
                placeholder={MANAGE_TASK_PLACEHOLDER}
                readOnly={readOnly}
                onChange={(value) => updateTask(index, value)}
                onBackspaceAtStart={() => handleTaskBackspaceAtStart(index)}
                inputRef={(el) => {
                  taskRefs.current[index] = el;
                }}
              />
              <ManagePromptChip
                value={durationDisplayValue(index)}
                placeholder={MANAGE_DURATION_PLACEHOLDER}
                readOnly={readOnly}
                onChange={(value) => updateTaskDuration(index, value)}
                onBackspaceAtStart={() => handleDurationBackspaceAtStart(index)}
                className="manage-prompt-chip--duration"
                inputRef={(el) => {
                  durationRefs.current[index] = el;
                }}
              />
            </span>
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
