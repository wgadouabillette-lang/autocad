import clsx from "clsx";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

export default function AgentRulesCard({
  title,
  hint,
  placeholder,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const hasRules = value.trim().length > 0;

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  const openEditor = () => {
    setDraft(value);
    setEditing(true);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const add = () => {
    onChange(draft.trim());
    setEditing(false);
  };

  return (
    <section
      className={clsx(
        "settings-section settings-section--card settings-agent-card",
        editing && "settings-agent-card--editing",
      )}
    >
      {!editing ? (
        <div className="settings-agent-card__body settings-agent-card__body--idle">
          <h3 className="settings-section__label settings-agent-card__idle-label">{title}</h3>
          <p className="settings-section__hint settings-agent-card__idle-hint">{hint}</p>
          <div className="settings-agent-card__button-wrap">
            <button
              type="button"
              className="chat-connectors-row__connect"
              onClick={openEditor}
            >
              {hasRules ? "Edit rules" : "Add rules"}
              <ArrowUpRight size={11} strokeWidth={2.25} className="shrink-0 opacity-80" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="settings-section__label">{title}</h3>
          <div className="settings-agent-card__body settings-agent-card__body--edit">
            <textarea
              ref={textareaRef}
              id={fieldId}
              className="settings-textarea settings-agent-card__textarea"
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="settings-agent-card__actions">
              <button type="button" className="chat-connectors-row__connect" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="chat-connectors-row__connect" onClick={add}>
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
