import { useStore } from "../../store/useStore";
import AgentInstructionsField from "./AgentInstructionsField";

export default function AiNotesAgentSettingsSection() {
  const agentAiNotesInstructions = useStore((s) => s.agentAiNotesInstructions);
  const setAgentAiNotesInstructions = useStore((s) => s.setAgentAiNotesInstructions);

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">AI Notes</h3>
      <p className="settings-section__hint">
        Personnalise la prise de notes live pendant les appels vocaux.
      </p>

      <AgentInstructionsField
        label="Instructions"
        hint="Structure, niveau de détail, éléments à capturer — utilisées comme guide pour vos notes."
        placeholder="Ex. : Séparer décisions, actions et questions ouvertes. Ignorer le small talk."
        value={agentAiNotesInstructions}
        onChange={setAgentAiNotesInstructions}
      />
    </section>
  );
}
