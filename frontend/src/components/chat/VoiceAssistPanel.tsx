import clsx from "clsx";
import { useEffect } from "react";
import { useRecapStore } from "../../store/useRecapStore";
import { useStore } from "../../store/useStore";
import ManualNotesPanel from "./ManualNotesPanel";

export default function VoiceAssistPanel() {
  const manualNoteResetTick = useStore((s) => s.manualNoteResetTick);
  const noteReveal = useRecapStore((s) => s.noteReveal);
  const recapGenerating = useRecapStore((s) => s.generating);
  const resetReveal = useRecapStore((s) => s.resetReveal);

  useEffect(() => {
    if (!noteReveal) return;
    const handle = window.setTimeout(() => resetReveal(), 920);
    return () => window.clearTimeout(handle);
  }, [noteReveal, resetReveal]);

  return (
    <div
      className={clsx(
        "voice-assist-panel",
        noteReveal && "recap-note-reveal",
        recapGenerating && "recap-note-reveal--generating",
      )}
    >
      <ManualNotesPanel key={`manual-note-${manualNoteResetTick}`} />
    </div>
  );
}
