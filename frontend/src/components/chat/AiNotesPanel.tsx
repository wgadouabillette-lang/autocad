import clsx from "clsx";
import { Loader2, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const structuredHtml = useAiNotesStore((s) => s.structuredHtml);
  const structuring = useAiNotesStore((s) => s.structuring);
  const structureError = useAiNotesStore((s) => s.structureError);
  const nextStructureAt = useAiNotesStore((s) => s.nextStructureAt);
  const error = useAiNotesStore((s) => s.error);
  const startedAt = useAiNotesStore((s) => s.startedAt);
  const stopAiNotes = useAiNotesStore((s) => s.stop);
  const savedMessages = useStore((s) => s.chat);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [secondsUntilStructure, setSecondsUntilStructure] = useState<number | null>(null);

  const savedLines = savedMessages
    .filter((m) => m.role === "assistant" || m.role === "user")
    .map((m) => m.text)
    .filter(Boolean);

  const liveTranscript = [
    ...lines.map((line) => line.text),
    ...(interimText.trim() ? [interimText.trim()] : []),
  ].join("\n");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines, interimText, structuredHtml]);

  useEffect(() => {
    if (!active || !nextStructureAt || structuring) {
      setSecondsUntilStructure(null);
      return;
    }
    const tick = () => {
      setSecondsUntilStructure(Math.max(0, Math.ceil((nextStructureAt - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [active, nextStructureAt, structuring]);

  const hasContent =
    lines.length > 0 ||
    interimText.trim().length > 0 ||
    structuredHtml.trim().length > 0 ||
    savedLines.length > 0;

  return (
    <div className="ai-notes-panel">
      <header className="ai-notes-panel__header">
        <div className="min-w-0">
          <p className="ai-notes-panel__status">
            {busy
              ? "Finalisation…"
              : active
                ? startedAt
                  ? `Enregistrement live · ${formatClock(startedAt)}`
                  : "Enregistrement live"
                : "Session terminée"}
          </p>
          {active && (
            <p className="ai-notes-panel__meta" aria-live="polite">
              {structuring
                ? "Structuration IA en cours…"
                : secondsUntilStructure !== null
                  ? `Prochaine structuration dans ${secondsUntilStructure}s`
                  : "En attente de parole…"}
            </p>
          )}
        </div>

        <div className="ai-notes-panel__header-actions">
          {active && (
            <>
              <span className="ai-notes-panel__live" aria-label="Transcription en direct">
                Live
              </span>
              <button
                type="button"
                className="ai-notes-panel__stop"
                onClick={() => void stopAiNotes()}
                disabled={busy}
                aria-label="Arrêter l'enregistrement AI Notes"
              >
                <Square size={12} fill="currentColor" aria-hidden />
                Stop
              </button>
            </>
          )}
          {structuring && (
            <Loader2 size={14} className="animate-spin text-muted-400" aria-hidden />
          )}
        </div>
      </header>

      <div ref={scrollRef} className="ai-notes-panel__body" aria-live="polite">
        {error && <p className="ai-notes-panel__error">{error}</p>}
        {structureError && active && (
          <p className="ai-notes-panel__error ai-notes-panel__error--soft" role="status">
            {structureError}
          </p>
        )}

        {!error && !hasContent && active && (
          <p className="ai-notes-panel__empty">
            Écoute en cours… Parlez pendant l&apos;appel — les notes structurées se mettent à jour
            toutes les 10 secondes.
          </p>
        )}

        {!error && !hasContent && !active && !busy && (
          <p className="ai-notes-panel__empty">
            Activez AI Notes pendant un appel vocal pour générer des notes en direct.
          </p>
        )}

        {active && structuredHtml.trim() && (
          <section className="ai-notes-panel__structured" aria-label="Notes structurées">
            <h3 className="ai-notes-panel__section-label">Notes structurées</h3>
            <div
              className="ai-notes-panel__structured-body"
              dangerouslySetInnerHTML={{ __html: structuredHtml }}
            />
          </section>
        )}

        {active && liveTranscript.trim() && (
          <details
            className={clsx(
              "ai-notes-panel__transcript",
              !structuredHtml.trim() && "ai-notes-panel__transcript--primary",
            )}
            open={!structuredHtml.trim()}
          >
            <summary className="ai-notes-panel__section-label">Transcription brute</summary>
            <div className="ai-notes-panel__transcript-body">
              {lines.map((line) => (
                <p key={line.id} className="ai-notes-panel__line">
                  {line.text}
                </p>
              ))}
              {interimText.trim() && (
                <p className="ai-notes-panel__line ai-notes-panel__line--interim">{interimText}</p>
              )}
            </div>
          </details>
        )}

        {!active &&
          savedLines.map((text, index) => (
            <p key={`saved-${index}`} className="ai-notes-panel__line">
              {text}
            </p>
          ))}
      </div>
    </div>
  );
}
