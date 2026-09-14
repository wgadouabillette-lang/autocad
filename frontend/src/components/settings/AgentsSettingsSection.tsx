import ChatAgentSettingsSection from "./ChatAgentSettingsSection";
import AiNotesAgentSettingsSection from "./AiNotesAgentSettingsSection";

export default function AgentsSettingsSection() {
  return (
    <div className="settings-agents">
      <ChatAgentSettingsSection />
      <AiNotesAgentSettingsSection />
    </div>
  );
}
