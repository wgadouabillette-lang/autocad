import { Trash2 } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

/** Aperçu design : suppression de conversation figée. Remettre à false pour le comportement réel. */
export const PREVIEW_DELETE_CHAT: boolean = false;

export function useDeleteChatDesignPreview(): void {
  useEffect(() => {
    if (!PREVIEW_DELETE_CHAT) return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <DeletePeopleChatOverlay
        title="Supprimer la conversation avec Camille ?"
        hint="Cette conversation et tous ses messages seront supprimés définitivement pour les deux participants."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    return () => {
      root.unmount();
      host.remove();
    };
  }, [PREVIEW_DELETE_CHAT]);
}

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
