import { Trash2 } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface DeletePeopleChatOverlayProps {
  title: string;
  hint: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeletePeopleChatOverlay({
  title,
  hint,
  confirmLabel = "Supprimer",
  busy = false,
  onConfirm,
  onCancel,
}: DeletePeopleChatOverlayProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <>
      <button
        type="button"
        className="join-knock__backdrop"
        aria-label="Fermer"
        onClick={onCancel}
      />
      <div
        className="join-knock voice-delete-overlay"
        role="dialog"
        aria-live="polite"
        aria-labelledby="delete-people-chat-title"
      >
        <div className="join-knock__icon voice-delete-overlay__icon" aria-hidden>
          <Trash2 size={28} strokeWidth={1.75} className="voice-delete-overlay__trash" />
        </div>

        <p id="delete-people-chat-title" className="join-knock__title">
          {title}
        </p>
        <p className="join-knock__hint">{hint}</p>

        <div className="join-knock__actions join-knock__actions--split">
          <button type="button" className="join-knock__btn" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="join-knock__btn voice-delete-overlay__confirm"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Suppression…" : confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
