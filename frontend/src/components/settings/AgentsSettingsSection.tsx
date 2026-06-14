import ChatAgentSettingsSection from "./ChatAgentSettingsSection";
import FollowUpAgentSettingsSection from "./FollowUpAgentSettingsSection";
import AiNotesAgentSettingsSection from "./AiNotesAgentSettingsSection";

export default function AgentsSettingsSection() {
  return (
    <div className="settings-agents">
      <ChatAgentSettingsSection />
      <FollowUpAgentSettingsSection />
      <AiNotesAgentSettingsSection />
    </div>
  );
}
