import { useStore } from "../../store/useStore";
import AgentRulesCard from "./AgentRulesCard";

export default function AiNotesAgentSettingsSection() {
  const agentAiNotesInstructions = useStore((s) => s.agentAiNotesInstructions);
  const setAgentAiNotesInstructions = useStore((s) => s.setAgentAiNotesInstructions);

  return (
    <AgentRulesCard
      title="AI Notes"
      hint="Personnalise la prise de notes live pendant les appels vocaux."
      placeholder="Ex. : Séparer décisions, actions et questions ouvertes. Ignorer le small talk."
      value={agentAiNotesInstructions}
      onChange={setAgentAiNotesInstructions}
    />
  );
}
