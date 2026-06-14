import { useStore } from "../../store/useStore";
import AgentInstructionsField from "./AgentInstructionsField";

export default function FollowUpAgentSettingsSection() {
  const agentFollowUpInstructions = useStore((s) => s.agentFollowUpInstructions);
  const setAgentFollowUpInstructions = useStore((s) => s.setAgentFollowUpInstructions);

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">Follow-up</h3>
      <p className="settings-section__hint">
        Personnalise la génération des récaps, actions calendrier et e-mails après un appel.
      </p>

      <AgentInstructionsField
        label="Instructions"
        hint="Priorités, ton des e-mails, format du récap — injectées lors de l'analyse de la transcription."
        placeholder="Ex. : Toujours proposer un créneau de suivi sous 48 h. E-mails courts et directs."
        value={agentFollowUpInstructions}
        onChange={setAgentFollowUpInstructions}
      />
    </section>
  );
}
