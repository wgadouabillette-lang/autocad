import { Loader2, Square } from "lucide-react";
import AssistantMarkdown from "./AssistantMarkdown";

interface Props {
  text: string;
  reveal?: boolean;
  onRevealComplete?: () => void;
}

interface AssistantPendingBubbleProps {
  label?: string;
  onStop?: () => void;
}

export function AssistantPendingBubble({ label, onStop }: AssistantPendingBubbleProps = {}) {
  return (
    <p className="assistant-pending" aria-live="polite" aria-busy="true">
      <Loader2 size={12} className="assistant-pending__spinner animate-spin" aria-hidden />
      <span className="assistant-pending__label">
        <span className="text-shimmer">{label ?? "Processing…"}</span>
      </span>
      {onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="assistant-pending__stop chat-connectors-row__connect"
        >
          <Square
            size={9}
            strokeWidth={2.25}
            className="shrink-0 fill-current opacity-80"
            aria-hidden
          />
          <span>Stop</span>
        </button>
      ) : null}
    </p>
  );
}

export default function StructuredAssistantMessage({
  text,
  reveal = false,
  onRevealComplete,
}: Props) {
  return (
    <AssistantMarkdown text={text} reveal={reveal} onRevealComplete={onRevealComplete} />
  );
}
