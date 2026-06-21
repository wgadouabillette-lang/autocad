import clsx from "clsx";
import { useEffect } from "react";
import { useRecapStore } from "../../store/useRecapStore";
import { useStore } from "../../store/useStore";
import FollowUpPanel from "./FollowUpPanel";
import ManualNotesPanel from "./ManualNotesPanel";

export default function VoiceAssistPanel() {
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const manualNoteResetTick = useStore((s) => s.manualNoteResetTick);
  const noteReveal = useRecapStore((s) => s.noteReveal);
  const recapGenerating = useRecapStore((s) => s.generating);
  const resetReveal = useRecapStore((s) => s.resetReveal);

  useEffect(() => {
    if (!noteReveal) return;
    const handle = window.setTimeout(() => resetReveal(), 920);
    return () => window.clearTimeout(handle);
  }, [noteReveal, resetReveal]);

  if (chatPanelMode === "follow-up") {
    return (
      <div className="voice-assist-panel">
        <FollowUpPanel />
      </div>
    );
  }

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
