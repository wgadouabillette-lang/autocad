import { ArrowLeft } from "lucide-react";

interface HandoffPreviewBannerProps {
  title: string;
  senderName: string;
  onBack: () => void;
}

export default function HandoffPreviewBanner({
  title,
  senderName,
  onBack,
}: HandoffPreviewBannerProps) {
  return (
    <div className="handoff-preview-banner chat-panel-rise-in">
      <button type="button" className="handoff-preview-banner__back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden />
        <span>Retour</span>
      </button>
      <div className="handoff-preview-banner__copy">
        <p className="handoff-preview-banner__eyebrow">Aperçu handoff — non enregistré</p>
        <p className="handoff-preview-banner__title">{title}</p>
        <p className="handoff-preview-banner__meta">De {senderName}</p>
      </div>
    </div>
  );
}
