import { useStore } from "../../store/useStore";
import AgentRulesCard from "./AgentRulesCard";

export default function ChatAgentSettingsSection() {
  const agentChatInstructions = useStore((s) => s.agentChatInstructions);
  const setAgentChatInstructions = useStore((s) => s.setAgentChatInstructions);

  return (
    <AgentRulesCard
      title="Chat"
      hint="Personnalise le comportement de l'assistant dans le chat."
      placeholder="Ex. : Réponds en français, style concis. Priorise les listes à puces pour les étapes."
      value={agentChatInstructions}
      onChange={setAgentChatInstructions}
    />
  );
}
