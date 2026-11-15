import { Mic, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AddVoiceChannelButtonProps {
  onStartDraft: () => void;
  disabled?: boolean;
}

export default function AddVoiceChannelButton({ onStartDraft, disabled }: AddVoiceChannelButtonProps) {
  const { t } = useTranslation();
  const label = t("calls.createVoiceChannel");
  return (
    <button
      type="button"
      className="open-channel-add"
      onClick={onStartDraft}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span className="open-channel-add__label">
        <Plus size={12} strokeWidth={2.25} aria-hidden />
        {t("calls.voiceChannel")}
        <Mic size={12} strokeWidth={2.25} aria-hidden />
      </span>
    </button>
  );
}
