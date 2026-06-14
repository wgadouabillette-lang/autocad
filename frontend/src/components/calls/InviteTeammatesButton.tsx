import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { usePeopleStore } from "../../store/usePeopleStore";

const MENU_WIDTH = 280;

interface MenuPosition {
  top: number;
  left: number;
}

export default function InviteTeammatesButton() {
  const sendFriendRequest = usePeopleStore((s) => s.sendFriendRequest);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const gap = 8;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    const top = rect.top - gap;
    setMenuPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    const onLayout = () => updateMenuPosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
      window.clearTimeout(t);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

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

  const menu =
    open && menuPos
      ? createPortal(
          <>
            <button
              type="button"
              className="invite-teammates__backdrop"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            />
            <div
              className="invite-teammates__menu"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: MENU_WIDTH,
                transform: "translateY(-100%)",
              }}
              role="dialog"
              aria-label="Inviter un coéquipier"
            >
              <p className="invite-teammates__menu-title">Inviter un coéquipier</p>
              <p className="invite-teammates__menu-hint">
                Entrez l&apos;adresse email d&apos;un coéquipier pour envoyer une invitation.
              </p>
              <form className="invite-teammates__form" onSubmit={onSubmit}>
                <input
                  ref={inputRef}
                  type="text"
                  className="invite-teammates__input"
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
                  className="invite-teammates__submit"
                  disabled={!handle.trim() || sending}
                >
                  {sending ? "Invitation…" : "Inviter"}
                </button>
              </form>
              {error && <p className="invite-teammates__feedback invite-teammates__feedback--error">{error}</p>}
              {sent && (
                <p className="invite-teammates__feedback">Invitation envoyée.</p>
              )}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="invite-teammates-btn"
        aria-label="Inviter un coéquipier"
        title="Inviter un coéquipier"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <UserPlus size={18} strokeWidth={2} aria-hidden />
      </button>
      {menu}
    </>
  );
}
