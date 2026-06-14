import { MicOff } from "lucide-react";

interface VoiceMuteBadgeProps {
  className?: string;
}

export default function VoiceMuteBadge({ className }: VoiceMuteBadgeProps) {
  return (
    <span
      className={className ?? "voice-mute-badge"}
      title="Micro coupé"
      aria-label="Micro coupé"
    >
      <MicOff size={16} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
