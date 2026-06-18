import clsx from "clsx";
import { ArrowUp, X } from "lucide-react";
import type { HandoffTarget } from "../../lib/handoffSkill";
import HandoffRecipientPicker from "./HandoffRecipientPicker";

interface HandoffComposerBarProps {
  selectedCount: number;
  target: HandoffTarget | null;
  submitting: boolean;
  error: string | null;
  onTargetChange: (target: HandoffTarget | null) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export default function HandoffComposerBar({
  selectedCount,
  target,
  submitting,
  error,
  onTargetChange,
  onCancel,
  onSubmit,
}: HandoffComposerBarProps) {
  const canSubmit = selectedCount > 0 && !!target && !submitting;

  return (
    <div className="handoff-composer-bar">
      <div className="handoff-composer-bar__header">
        <span className="handoff-composer-bar__prefix">/handoff</span>
        <span className="handoff-composer-bar__count">
          {selectedCount} message{selectedCount === 1 ? "" : "s"} sélectionné
          {selectedCount === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          className="handoff-composer-bar__cancel"
          onClick={onCancel}
          aria-label="Cancel handoff"
        >
          <X size={14} />
        </button>
      </div>

      <HandoffRecipientPicker target={target} onChange={onTargetChange} />

      {error ? <p className="handoff-composer-bar__error">{error}</p> : null}

      <div className="handoff-composer-bar__actions">
        <button
          type="button"
          className="handoff-composer-bar__send"
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          <ArrowUp size={14} strokeWidth={2.5} />
          <span>{submitting ? "Envoi…" : "Send handoff"}</span>
        </button>
      </div>
    </div>
  );
}
