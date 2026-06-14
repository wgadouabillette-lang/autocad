import clsx from "clsx";
import { useStore } from "../../store/useStore";
import { AI_MODELS, aiModelLabel, type AiModel } from "../../lib/aiModels";
import { hasAiAccess } from "../../lib/subscriptionPlans";

export default function ModelsSettingsSection() {
  const aiModel = useStore((s) => s.aiModel);
  const setAiModel = useStore((s) => s.setAiModel);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const aiAvailable = hasAiAccess(subscriptionPlan);

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Modèle IA</h3>
      <p className="settings-section__hint">
        {aiAvailable
          ? "Modèle utilisé pour la génération et l'assistant dans le chat. En cas de limite API, Lyte repasse automatiquement en mode Auto — abonnement Pro requis ; l'usage à la demande peut être ajouté en complément."
          : "Disponible avec l'abonnement Pro."}
      </p>
      <div className={clsx("settings-section__stack", !aiAvailable && "settings-section__stack--locked")}>
        {AI_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!aiAvailable}
            onClick={() => setAiModel(m.id as AiModel)}
            className={clsx(
              "settings-option",
              aiModel === m.id && aiAvailable && "settings-option--active",
            )}
          >
            <span className="settings-option__title">{m.label}</span>
            {m.id === "auto" && (
              <span className="settings-option__subtitle">
                GPT 4.1 nano par défaut — chat économique, sans logo. Reprise automatique si limite API.
              </span>
            )}
          </button>
        ))}
      </div>
      {aiAvailable && (
        <p className="settings-section__meta">
          Actuel : <span className="text-muted-300">{aiModelLabel(aiModel)}</span>
        </p>
      )}
    </section>
  );
}
