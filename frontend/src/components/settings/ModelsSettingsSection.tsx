import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useStore } from "../../store/useStore";
import { SETTINGS_AI_MODELS, type AiModel } from "../../lib/aiModels";
import { AiModelIcon } from "../chat/aiModelLogos";

export default function ModelsSettingsSection() {
  const aiModel = useStore((s) => s.aiModel);
  const setAiModel = useStore((s) => s.setAiModel);

  return (
    <section className="settings-section">
      <div className="chat-connectors-list chat-connectors-list--settings" role="list" aria-label="AI models">
        {SETTINGS_AI_MODELS.map((m) => {
          const active = aiModel === m.id;
          return (
            <div
              key={m.id}
              role="listitem"
              className={clsx("chat-connectors-row", active && "settings-model-row--active")}
            >
              <div className="chat-connectors-row__main">
                {m.icon ? (
                  <span className="chat-connectors-row__icon">
                    <AiModelIcon icon={m.icon} />
                  </span>
                ) : null}
                <span className="chat-connectors-row__label">{m.label}</span>
              </div>

              <button
                type="button"
                className="chat-connectors-row__connect"
                onClick={() => setAiModel(m.id as AiModel)}
                disabled={active}
                aria-pressed={active}
              >
                {active ? "In use" : "Use"}
                {!active && (
                  <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
