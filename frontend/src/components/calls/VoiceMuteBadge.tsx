import { useTranslation } from "react-i18next";
import { MicOff } from "lucide-react";

interface VoiceMuteBadgeProps {
  className?: string;
}

export default function VoiceMuteBadge({ className }: VoiceMuteBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      className={className ?? "voice-mute-badge"}
      title={t("calls.micMuted")}
      aria-label={t("calls.micMuted")}
    >
      <MicOff size={16} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
