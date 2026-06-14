import { useEffect, useRef } from "react";
import { useAiNotesStore } from "../../store/useAiNotesStore";
import { useStore } from "../../store/useStore";

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AiNotesPanel() {
  const active = useAiNotesStore((s) => s.active);
  const busy = useAiNotesStore((s) => s.busy);
  const lines = useAiNotesStore((s) => s.lines);
  const interimText = useAiNotesStore((s) => s.interimText);
  const error = useAiNotesStore((s) => s.error);
  const startedAt = useAiNotesStore((s) => s.startedAt);
  const savedMessages = useStore((s) => s.chat);
  const scrollRef = useRef<HTMLDivElement>(null);

  const savedLines = savedMessages
    .filter((m) => m.role === "assistant" || m.role === "user")
    .map((m) => m.text)
    .filter(Boolean);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, interimText]);

  const hasContent =
    lines.length > 0 || interimText.trim().length > 0 || savedLines.length > 0;

  return (
    <div className="ai-notes-panel">
      <header className="ai-notes-panel__header">
        <div>
          <p className="ai-notes-panel__status">
            {busy
              ? "Préparation…"
              : active
                ? startedAt
                  ? `Enregistrement live · ${formatClock(startedAt)}`
                  : "Enregistrement live"
                : "Session terminée"}
          </p>
        </div>
        {active && (
          <span className="ai-notes-panel__live" aria-label="Transcription en direct">
            Live
          </span>
        )}
      </header>

      <div ref={scrollRef} className="ai-notes-panel__body" aria-live="polite">
        {error && <p className="ai-notes-panel__error">{error}</p>}

        {!error && !hasContent && active && (
          <p className="ai-notes-panel__empty">
            Écoute en cours… Les notes apparaîtront ici au fil de la conversation.
          </p>
        )}

        {!error && !hasContent && !active && !busy && (
          <p className="ai-notes-panel__empty">
            Activez AI Notes pendant un appel vocal pour générer des notes en direct.
          </p>
        )}

        {!active &&
          savedLines.map((text, index) => (
            <p key={`saved-${index}`} className="ai-notes-panel__line">{text}</p>
          ))}

        {active &&
          lines.map((line) => (
            <p key={line.id} className="ai-notes-panel__line">
              {line.text}
            </p>
          ))}

        {active && interimText.trim() && (
          <p className="ai-notes-panel__line ai-notes-panel__line--interim">{interimText}</p>
        )}
      </div>
    </div>
  );
}
