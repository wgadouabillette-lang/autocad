import { Loader2 } from "lucide-react";
import AssistantMarkdown from "./AssistantMarkdown";

interface Props {
  text: string;
  reveal?: boolean;
  onRevealComplete?: () => void;
}

export function AssistantPendingBubble() {
  return (
    <p className="assistant-pending" aria-live="polite" aria-busy="true">
      <Loader2 size={12} className="assistant-pending__spinner animate-spin" aria-hidden />
      <span className="text-shimmer">Processing…</span>
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
