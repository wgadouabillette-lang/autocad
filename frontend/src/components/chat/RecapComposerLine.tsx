import clsx from "clsx";
import { ChevronDown, Film, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { RecapComposerDraft } from "../../lib/recapSkill";
import { useStore } from "../../store/useStore";

interface RecapComposerLineProps {
  draft: RecapComposerDraft | null;
  onChange: (draft: RecapComposerDraft | null) => void;
  onImportClick: () => void;
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "";
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export default function RecapComposerLine({
  draft,
  onChange,
  onImportClick,
}: RecapComposerLineProps) {
  const chatSessions = useStore((s) => s.chatSessions);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const recordings = useMemo(
    () =>
      chatSessions
        .filter((session) => session.kind === "recording" && session.recordingId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [chatSessions],
  );

  const selectRecording = (session: (typeof recordings)[number]) => {
    onChange({
      kind: "recording",
      recordingId: session.recordingId,
      label: session.title,
      durationMs: session.durationMs,
    });
    setMenuOpen(false);
  };

  return (
    <div className="recap-composer-line">
      <div className="recap-composer-line__row">
        <span className="recap-composer-line__prefix">/recap</span>
        {draft ? (
          <button
            type="button"
            className="recap-composer-line__chip"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            <Film size={12} className="shrink-0 opacity-80" aria-hidden />
            <span className="min-w-0 truncate">{draft.label}</span>
            {draft.durationMs ? (
              <span className="recap-composer-line__duration">{formatDuration(draft.durationMs)}</span>
            ) : null}
            <ChevronDown size={12} className="shrink-0 opacity-70" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="recap-composer-line__placeholder"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Choose a recording
          </button>
        )}
        <button
          type="button"
          className="recap-composer-line__import"
          onClick={onImportClick}
          title="Import video from your computer"
          aria-label="Import video from your computer"
        >
          <Upload size={12} aria-hidden />
          <span>Import</span>
        </button>
      </div>

      {menuOpen ? (
        <div ref={menuRef} className="recap-composer-line__menu" role="listbox">
          {recordings.length === 0 ? (
            <p className="recap-composer-line__empty">No recordings yet — use Import or record from the bottom bar.</p>
          ) : (
            recordings.map((session) => (
              <button
                key={session.id}
                type="button"
                role="option"
                className={clsx(
                  "recap-composer-line__menu-item",
                  draft?.recordingId === session.recordingId && "recap-composer-line__menu-item--active",
                )}
                onClick={() => selectRecording(session)}
              >
                <Film size={13} className="shrink-0 text-muted-400" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-100">
                  {session.title}
                </span>
                {session.durationMs ? (
                  <span className="text-[10px] text-muted-500">{formatDuration(session.durationMs)}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
