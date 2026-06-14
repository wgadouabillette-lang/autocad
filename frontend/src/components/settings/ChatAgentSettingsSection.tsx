import clsx from "clsx";
import { useStore } from "../../store/useStore";
import AgentInstructionsField from "./AgentInstructionsField";

export default function ChatAgentSettingsSection() {
  const autoWorkModeSwitch = useStore((s) => s.autoWorkModeSwitch);
  const chatWorkMode = useStore((s) => s.chatWorkMode);
  const setAutoWorkModeSwitch = useStore((s) => s.setAutoWorkModeSwitch);
  const agentChatInstructions = useStore((s) => s.agentChatInstructions);
  const setAgentChatInstructions = useStore((s) => s.setAgentChatInstructions);

  return (
    <section className="settings-section settings-section--card">
      <h3 className="settings-section__label">Chat</h3>
      <p className="settings-section__hint">
        Personnalise le comportement de l&apos;assistant dans le chat.
      </p>

      <AgentInstructionsField
        label="Instructions"
        hint="Ton, format de réponse, règles internes — ajoutées au prompt système du chat."
        placeholder="Ex. : Réponds en français, style concis. Priorise les listes à puces pour les étapes."
        value={agentChatInstructions}
        onChange={setAgentChatInstructions}
      />

      <label className={clsx("settings-toggle settings-agent-field")}>
        <input
          type="checkbox"
          checked={autoWorkModeSwitch}
          onChange={(event) => setAutoWorkModeSwitch(event.target.checked)}
          className="settings-toggle__input"
        />
        <span className="settings-toggle__text">
          <span className="settings-toggle__title">Sélection automatique du mode</span>
          <span className="settings-toggle__desc">
            Bascule entre Agent et Render selon la demande (édition simple vs modélisation depuis
            un plan, une image ou une description détaillée).
          </span>
        </span>
      </label>

      <p className="settings-section__meta">
        Mode actuel :{" "}
        <span className="text-muted-300">{chatWorkMode === "render" ? "Render" : "Agent"}</span>
      </p>
    </section>
  );
}
