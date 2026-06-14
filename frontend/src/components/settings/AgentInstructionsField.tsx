import { useId } from "react";

export default function AgentInstructionsField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const fieldId = useId();

  return (
    <div className="settings-agent-field">
      <label htmlFor={fieldId} className="settings-section__label">
        {label}
      </label>
      <p className="settings-section__hint">{hint}</p>
      <textarea
        id={fieldId}
        className="settings-textarea"
        rows={5}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
