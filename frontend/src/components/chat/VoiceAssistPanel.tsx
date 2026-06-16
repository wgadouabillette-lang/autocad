import { useAiNotesStore } from "../../store/useAiNotesStore";
import { useStore } from "../../store/useStore";
import AiNotesPanel from "./AiNotesPanel";
import FollowUpPanel from "./FollowUpPanel";
import ManualNotesPanel from "./ManualNotesPanel";

export default function VoiceAssistPanel() {
  const chatPanelMode = useStore((s) => s.chatPanelMode);
  const manualNoteResetTick = useStore((s) => s.manualNoteResetTick);
  const aiNotesActive = useAiNotesStore((s) => s.active);
  const aiNotesBusy = useAiNotesStore((s) => s.busy);

  if (chatPanelMode === "follow-up") {
    return (
      <div className="voice-assist-panel">
        <FollowUpPanel />
      </div>
    );
  }

  const showLiveAiNotes = aiNotesActive || aiNotesBusy;

  return (
    <div className="voice-assist-panel">
      {showLiveAiNotes ? (
        <AiNotesPanel />
      ) : (
        <ManualNotesPanel key={`manual-note-${manualNoteResetTick}`} />
      )}
    </div>
  );
}
