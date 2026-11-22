import { X } from "lucide-react";
import { PEOPLE_CHAT_EMOJIS } from "../../lib/peopleChatEmojis";

interface PeopleChatEmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function PeopleChatEmojiPicker({ onSelect, onClose }: PeopleChatEmojiPickerProps) {
  return (
    <div className="friends-chat-emoji-row" aria-label="Choose an emoji">
      <div className="friends-chat-emoji-row__scroller" role="listbox" aria-label="Emojis">
        {PEOPLE_CHAT_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="option"
            className="friends-chat-emoji-row__emoji"
            aria-label={`Add ${emoji}`}
            onClick={() => onSelect(emoji)}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        className="friends-chat-emoji-row__close"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={14} strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
