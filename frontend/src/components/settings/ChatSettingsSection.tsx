import clsx from "clsx";
import { useStore } from "../../store/useStore";
import { hasAiAccess } from "../../lib/subscriptionPlans";

export default function ChatSettingsSection() {
  const chatWorkMode = useStore((s) => s.chatWorkMode);
  const autoWorkModeSwitch = useStore((s) => s.autoWorkModeSwitch);
  const setAutoWorkModeSwitch = useStore((s) => s.setAutoWorkModeSwitch);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const aiAvailable = hasAiAccess(subscriptionPlan);

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Mode assistant</h3>
      <p className="settings-section__hint">
        {aiAvailable
          ? "Render modélise à partir d'un plan ; Agent gère le reste."
          : "Disponible avec le forfait Pro."}
      </p>
      <label className={clsx("settings-toggle", !aiAvailable && "settings-toggle--locked")}>
        <input
          type="checkbox"
          checked={autoWorkModeSwitch}
          disabled={!aiAvailable}
          onChange={(e) => setAutoWorkModeSwitch(e.target.checked)}
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
      {aiAvailable && (
        <p className="settings-section__meta">
          Mode actuel :{" "}
          <span className="text-muted-300">{chatWorkMode === "render" ? "Render" : "Agent"}</span>
        </p>
      )}
    </section>
  );
}
