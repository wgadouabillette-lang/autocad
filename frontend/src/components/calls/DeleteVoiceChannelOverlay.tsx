import { Trash2 } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { createPortal } from "react-dom";

const DELETE_CONFIRM_TEXT = "delete";

interface DeleteVoiceChannelOverlayProps {
  channelName: string;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteVoiceChannelOverlay({
  channelName,
  confirmText,
  onConfirmTextChange,
  onConfirm,
  onCancel,
}: DeleteVoiceChannelOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canConfirm = confirmText === DELETE_CONFIRM_TEXT;

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canConfirm) return;
    onConfirm();
  };

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
        aria-label={`Supprimer ${channelName}`}
      >
        <div className="join-knock__icon voice-delete-overlay__icon" aria-hidden>
          <Trash2 size={28} strokeWidth={1.75} className="voice-delete-overlay__trash" />
        </div>

        <p className="join-knock__title">
          Supprimer <span className="join-knock__name">{channelName}</span> ?
        </p>

        <p className="join-knock__hint">
          Écrivez <span className="voice-delete-overlay__keyword">{DELETE_CONFIRM_TEXT}</span> pour
          confirmer la suppression du salon vocal.
        </p>

        <form className="voice-delete-overlay__form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="voice-delete-overlay__input"
            value={confirmText}
            onChange={(event) => onConfirmTextChange(event.target.value)}
            placeholder={DELETE_CONFIRM_TEXT}
            aria-label={`Écrire ${DELETE_CONFIRM_TEXT} pour confirmer`}
            autoComplete="off"
            spellCheck={false}
          />

          <div className="join-knock__actions join-knock__actions--split">
            <button type="button" className="join-knock__btn" onClick={onCancel}>
              Annuler
            </button>
            <button
              type="submit"
              className="join-knock__btn voice-delete-overlay__confirm"
              disabled={!canConfirm}
            >
              Supprimer
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
