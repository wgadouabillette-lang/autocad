import clsx from "clsx";
import { useStore } from "../../store/useStore";
import { SETTINGS_AI_MODELS, aiModelLabel, type AiModel } from "../../lib/aiModels";

export default function ModelsSettingsSection() {
  const aiModel = useStore((s) => s.aiModel);
  const setAiModel = useStore((s) => s.setAiModel);

  return (
    <section className="settings-section">
      <div className="settings-section__stack">
        {SETTINGS_AI_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setAiModel(m.id as AiModel)}
            className={clsx(
              "settings-option",
              aiModel === m.id && "settings-option--active",
            )}
          >
            <span className="settings-option__title">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="settings-section__meta">
        Actuel : <span className="text-muted-300">{aiModelLabel(aiModel)}</span>
      </p>
    </section>
  );
}
