import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { useStore } from "../../store/useStore";

const SUPPORT_EMAIL = "support@hall.app";

export type SupportTicketReasonId =
  | "billing"
  | "bug"
  | "account"
  | "feature"
  | "other";

const SUPPORT_REASONS: { id: SupportTicketReasonId; label: string; subject: string }[] = [
  { id: "billing", label: "Facturation", subject: "Billing" },
  { id: "bug", label: "Bug / technique", subject: "Bug" },
  { id: "account", label: "Compte & accès", subject: "Account" },
  { id: "feature", label: "Idée / fonctionnalité", subject: "Feature request" },
  { id: "other", label: "Autre", subject: "Other" },
];

interface SupportTicketOverlayProps {
  onClose: () => void;
}

export default function SupportTicketOverlay({ onClose }: SupportTicketOverlayProps) {
  const detailsRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState<"reason" | "details">("reason");
  const [reasonId, setReasonId] = useState<SupportTicketReasonId | null>(null);
  const [details, setDetails] = useState("");
  const userDisplayName = useStore((s) => s.userDisplayName);
  const userEmail = useStore((s) => s.userEmail);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (step === "details") {
          setStep("reason");
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, step]);

  useEffect(() => {
    if (step !== "details") return;
    const timer = window.setTimeout(() => detailsRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [step]);

  const selectedReason = SUPPORT_REASONS.find((reason) => reason.id === reasonId) ?? null;

  const goToDetails = (id: SupportTicketReasonId) => {
    setReasonId(id);
    setStep("details");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedReason || !details.trim()) return;

    const subject = encodeURIComponent(`[Meetra Support] ${selectedReason.subject}`);
    const body = encodeURIComponent(
      [
        `Raison: ${selectedReason.label}`,
        `Nom: ${userDisplayName || "—"}`,
        `Email: ${userEmail || "—"}`,
        "",
        "Détails:",
        details.trim(),
      ].join("\n"),
    );
    window.open(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`, "_blank");
    onClose();
  };

  return createPortal(
    <>
      <button
        type="button"
        className="join-knock__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="join-knock support-ticket-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-ticket-title"
      >
        <div className="group-chat-create-overlay__icon" aria-hidden>
          <CircleHelp size={22} strokeWidth={1.75} />
        </div>

        {step === "reason" ? (
          <>
            <p id="support-ticket-title" className="join-knock__title">
              Contacter le support
            </p>
            <p className="join-knock__hint">Choisissez la raison de votre ticket.</p>

            <ul className="support-ticket-overlay__reasons">
              {SUPPORT_REASONS.map((reason) => (
                <li key={reason.id}>
                  <button
                    type="button"
                    className="support-ticket-overlay__reason"
                    onClick={() => goToDetails(reason.id)}
                  >
                    {reason.label}
                  </button>
                </li>
              ))}
            </ul>

            <div className="join-knock__actions">
              <button type="button" className="join-knock__btn" onClick={onClose}>
                Annuler
              </button>
            </div>
          </>
        ) : (
          <form className="support-ticket-overlay__form" onSubmit={handleSubmit}>
            <button
              type="button"
              className="support-ticket-overlay__back"
              onClick={() => setStep("reason")}
            >
              <ArrowLeft size={14} strokeWidth={2.25} aria-hidden />
              {selectedReason?.label ?? "Retour"}
            </button>

            <p id="support-ticket-title" className="join-knock__title">
              Raison de l&apos;appel
            </p>
            <p className="join-knock__hint">
              Décrivez votre demande — nous vous répondrons à {SUPPORT_EMAIL}.
            </p>

            <label className="group-chat-create-overlay__label" htmlFor="support-ticket-details">
              Détails
            </label>
            <textarea
              ref={detailsRef}
              id="support-ticket-details"
              className="support-ticket-overlay__textarea"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Que pouvons-nous faire pour vous ?"
              rows={5}
              maxLength={4000}
            />

            <div className="group-chat-create-overlay__actions">
              <button type="button" className="group-chat-create-overlay__ghost" onClick={onClose}>
                Annuler
              </button>
              <button
                type="submit"
                className="group-chat-create-overlay__submit"
                disabled={!details.trim()}
              >
                Envoyer
              </button>
            </div>
          </form>
        )}
      </div>
    </>,
    document.body,
  );
}
