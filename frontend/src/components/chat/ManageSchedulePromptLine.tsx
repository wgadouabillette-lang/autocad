import clsx from "clsx";
import { Plus, X } from "lucide-react";
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
  className?: string;
}

function ManagePromptChip({
  value,
  placeholder,
  readOnly,
  onChange,
  className,
}: ManagePromptChipProps) {
  const inputSize = Math.max(value.length > 0 ? value.length : placeholder.length, 1);

  if (readOnly) {
    return (
      <span className={clsx("manage-prompt-chip manage-prompt-chip--readonly", className)}>
        {value}
      </span>
    );
  }

  return (
    <span className={clsx("manage-prompt-chip", className)}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        size={inputSize}
        onChange={(e) => onChange?.(e.target.value)}
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
  onClose?: () => void;
}

export default function ManageSchedulePromptLine({
  draft,
  onChange,
  readOnly = false,
  onClose,
}: ManageSchedulePromptLineProps) {
  const updateTask = (index: number, value: string) => {
    if (!onChange) return;
    const tasks = [...draft.tasks];
    tasks[index] = value;
    onChange({ ...draft, tasks });
  };

  const addTask = () => {
    if (!onChange) return;
    onChange({ ...draft, tasks: [...draft.tasks, ""] });
  };

  const removeTask = (index: number) => {
    if (!onChange || draft.tasks.length <= 1) return;
    onChange({ ...draft, tasks: draft.tasks.filter((_, i) => i !== index) });
  };

  const updateDeadline = (value: string) => {
    onChange?.({ ...draft, deadline: value });
  };

  return (
    <div className={clsx("manage-prompt-line", readOnly && "manage-prompt-line--readonly")}>
      {!readOnly && onClose ? (
        <button
          type="button"
          className="manage-prompt-line__close"
          onClick={onClose}
          aria-label="Close /manage"
        >
          <X size={12} aria-hidden />
        </button>
      ) : null}

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
            />
            {!readOnly && draft.tasks.length > 1 ? (
              <button
                type="button"
                className="manage-prompt-line__remove-task"
                onClick={() => removeTask(index)}
                aria-label="Remove this task"
              >
                <X size={10} aria-hidden />
              </button>
            ) : null}
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
        />
        <span>, taking into account my current schedule.</span>
      </p>
    </div>
  );
}
