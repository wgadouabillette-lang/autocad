import clsx from "clsx";
import { ArrowUp, X } from "lucide-react";
import HandoffRecipientPicker from "./HandoffRecipientPicker";
import type { HandoffTarget } from "../../lib/handoffSkill";

interface HandoffNoteOverlayProps {
  open: boolean;
  noteTitle: string;
  target: HandoffTarget | null;
  submitting: boolean;
  error: string | null;
  onTargetChange: (target: HandoffTarget | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function HandoffNoteOverlay({
  open,
  noteTitle,
  target,
  submitting,
  error,
  onTargetChange,
  onClose,
  onSubmit,
}: HandoffNoteOverlayProps) {
  if (!open) return null;

  return (
    <div className="handoff-note-overlay" role="dialog" aria-label="Handoff note">
      <div className="handoff-note-overlay__panel">
        <div className="handoff-note-overlay__header">
          <span className="handoff-note-overlay__title">Handoff note</span>
          <button type="button" className="handoff-note-overlay__close" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <p className="handoff-note-overlay__note-name">{noteTitle || "Sans titre"}</p>
        <HandoffRecipientPicker target={target} onChange={onTargetChange} />
        {error ? <p className="handoff-note-overlay__error">{error}</p> : null}
        <button
          type="button"
          className={clsx("handoff-note-overlay__send", !target && "is-disabled")}
          disabled={!target || submitting}
          onClick={onSubmit}
        >
          <ArrowUp size={14} strokeWidth={2.5} />
          <span>{submitting ? "Envoi…" : "Send handoff"}</span>
        </button>
      </div>
    </div>
  );
}
