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
      <Plus size={16} strokeWidth={2} aria-hidden />
      <Mic size={14} strokeWidth={2} aria-hidden />
      <span>Créer un salon vocal</span>
    </button>
  );
}
