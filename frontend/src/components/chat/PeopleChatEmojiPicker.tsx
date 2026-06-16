import { X } from "lucide-react";
import { PEOPLE_CHAT_EMOJIS } from "../../lib/peopleChatEmojis";

interface PeopleChatEmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function PeopleChatEmojiPicker({ onSelect, onClose }: PeopleChatEmojiPickerProps) {
  return (
    <div className="people-chat-emoji-picker" aria-label="Choose an emoji">
      <button
        type="button"
        className="chat-poll-composer__close"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={18} aria-hidden />
      </button>

      <div className="people-chat-emoji-picker__body">
        <p className="people-chat-emoji-picker__title">Emoji</p>
        <div className="people-chat-emoji-picker__grid" role="listbox" aria-label="Emojis">
          {PEOPLE_CHAT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="option"
              className="people-chat-emoji-picker__emoji"
              aria-label={`Add ${emoji}`}
              onClick={() => onSelect(emoji)}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
