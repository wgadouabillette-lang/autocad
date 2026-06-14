import { useStore } from "../../store/useStore";
import AiNotesPanel from "./AiNotesPanel";
import FollowUpPanel from "./FollowUpPanel";

export default function VoiceAssistPanel() {
  const chatPanelMode = useStore((s) => s.chatPanelMode);

  return (
    <div className="voice-assist-panel">
      {chatPanelMode === "follow-up" ? <FollowUpPanel /> : <AiNotesPanel />}
    </div>
  );
}
