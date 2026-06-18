import { ArrowRightLeft } from "lucide-react";

interface HandoffInboxCardProps {
  senderName: string;
  title?: string;
  preview?: string;
  onOpen: () => void;
}

export default function HandoffInboxCard({
  senderName,
  title,
  preview,
  onOpen,
}: HandoffInboxCardProps) {
  return (
    <div className="handoff-inbox-card">
      <div className="handoff-inbox-card__icon" aria-hidden>
        <ArrowRightLeft size={14} />
      </div>
      <div className="handoff-inbox-card__body">
        <p className="handoff-inbox-card__title">
          {senderName} vous a transmis un handoff
        </p>
        {title ? <p className="handoff-inbox-card__subtitle">{title}</p> : null}
        {preview ? <p className="handoff-inbox-card__preview">{preview}</p> : null}
        <button type="button" className="handoff-inbox-card__open" onClick={onOpen}>
          Ouvrir
        </button>
      </div>
    </div>
  );
}
