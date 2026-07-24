import { Mic, Plus } from "lucide-react";

interface AddVoiceChannelButtonProps {
  onStartDraft: () => void;
  disabled?: boolean;
}

export default function AddVoiceChannelButton({ onStartDraft, disabled }: AddVoiceChannelButtonProps) {
  return (
    <button
      type="button"
      className="open-channel-add"
      onClick={onStartDraft}
      disabled={disabled}
      aria-label="Créer un salon vocal"
      title="Créer un salon vocal"
    >
      <span className="open-channel-add__label">
        <Plus size={12} strokeWidth={2.25} aria-hidden />
        Salon vocal
        <Mic size={12} strokeWidth={2.25} aria-hidden />
      </span>
    </button>
  );
}
