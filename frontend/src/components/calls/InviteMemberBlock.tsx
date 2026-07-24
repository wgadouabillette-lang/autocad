import { Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePeopleStore } from "../../store/usePeopleStore";

interface InviteMemberBlockProps {
  index?: number;
}

export default function InviteMemberBlock({ index = 0 }: InviteMemberBlockProps) {
  const sendFriendRequest = usePeopleStore((s) => s.sendFriendRequest);
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setError(null);
    setSent(false);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);
    setSending(true);
    try {
      const result = await sendFriendRequest(handle);
      if (!result.ok) {
        setError(result.error ?? "Impossible d'envoyer l'invitation.");
        return;
      }
      setHandle("");
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const overlay = open
    ? createPortal(
        <div className="invite-member-overlay" role="presentation">
          <button
            type="button"
            className="invite-member-overlay__backdrop"
            aria-label="Fermer"
            onClick={close}
          />
          <div
            className="invite-member-overlay__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Inviter un membre"
          >
            <div className="invite-member-overlay__header">
              <p className="invite-member-overlay__title">Inviter un membre</p>
              <button
                type="button"
                className="invite-member-overlay__close"
                onClick={close}
                aria-label="Fermer"
              >
                <X size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
            <div className="invite-member-overlay__body">
              <p className="invite-member-overlay__hint">
                Entrez l&apos;adresse email pour envoyer une invitation.
              </p>
              <form className="invite-member-overlay__form" onSubmit={onSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  className="invite-member-overlay__input"
                  placeholder="Adresse email"
                  value={handle}
                  disabled={sending}
                  onChange={(event) => {
                    setHandle(event.target.value);
                    setError(null);
                    setSent(false);
                  }}
                />
                <button
                  type="submit"
                  className="invite-member-overlay__submit"
                  disabled={!handle.trim() || sending}
                >
                  {sending ? "Invitation…" : "Inviter"}
                </button>
              </form>
              {error && (
                <p className="invite-member-overlay__feedback invite-member-overlay__feedback--error">
                  {error}
                </p>
              )}
              {sent && (
                <p className="invite-member-overlay__feedback">Invitation envoyée.</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <article
        className="forma-capsule call-block call-block--cascade call-block--private call-block--side call-block--invite"
        style={{ animationDelay: `${index * 20}ms` }}
      >
        <div className="call-block__clip">
          <button
            type="button"
            className="call-block__main call-block__main--invite"
            onClick={() => setOpen(true)}
            aria-label="Inviter un membre"
            aria-haspopup="dialog"
            aria-expanded={open}
            title="Inviter un membre"
          >
            <span className="call-block-invite__icon-wrap" aria-hidden>
              <UserRound size={28} strokeWidth={1.75} className="call-block-invite__icon" />
              <span className="call-block-invite__badge">
                <Plus size={10} strokeWidth={2.75} />
              </span>
            </span>
          </button>
        </div>
      </article>
      {overlay}
    </>
  );
}
