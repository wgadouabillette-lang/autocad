import { useStore } from "../../store/useStore";
import AgentRulesCard from "./AgentRulesCard";

export default function FollowUpAgentSettingsSection() {
  const agentFollowUpInstructions = useStore((s) => s.agentFollowUpInstructions);
  const setAgentFollowUpInstructions = useStore((s) => s.setAgentFollowUpInstructions);

  return (
    <AgentRulesCard
      title="Follow-up"
      hint="Personnalise la génération des récaps, actions calendrier et e-mails après un appel."
      placeholder="Ex. : Toujours proposer un créneau de suivi sous 48 h. E-mails courts et directs."
      value={agentFollowUpInstructions}
      onChange={setAgentFollowUpInstructions}
    />
  );
}
