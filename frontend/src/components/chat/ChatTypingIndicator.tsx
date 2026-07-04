import UserAvatar from "../UserAvatar";
import type { ChatTyper } from "../../hooks/useChatTyping";

interface ChatTypingIndicatorProps {
  typers: ChatTyper[];
}

function truncateTyperName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 9) return trimmed;
  return `${trimmed.slice(0, 9)}.`;
}

function TypingDots() {
  return (
    <span className="chat-typing-dots" aria-hidden>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export default function ChatTypingIndicator({ typers }: ChatTypingIndicatorProps) {
  if (typers.length === 0) return null;

  if (typers.length > 1) {
    const visibleTypers = typers.slice(0, 3);

    return (
      <div className="chat-typing-indicator" role="status" aria-live="polite">
        <div className="chat-typing-indicator__row">
          <div className="chat-typing-indicator__avatars" aria-hidden>
            {visibleTypers.map((typer, index) => (
              <UserAvatar
                key={typer.userId}
                userId={typer.userId}
                name={typer.name}
                photoURL={typer.photoURL}
                isLocal={typer.isLocal}
                className="chat-typing-indicator__avatar"
                style={{ zIndex: index + 1 }}
              />
            ))}
          </div>
          <p className="chat-typing-indicator__text">
            Plusieurs sont en train d&apos;écrire
            <TypingDots />
          </p>
        </div>
      </div>
    );
  }

  const typer = typers[0]!;

  return (
    <div className="chat-typing-indicator" role="status" aria-live="polite">
      <div className="chat-typing-indicator__row">
        <UserAvatar
          userId={typer.userId}
          name={typer.name}
          photoURL={typer.photoURL}
          isLocal={typer.isLocal}
          className="chat-typing-indicator__avatar"
        />
        <p className="chat-typing-indicator__text">
          {truncateTyperName(typer.name)} est en train d&apos;écrire
          <TypingDots />
        </p>
      </div>
    </div>
  );
}
