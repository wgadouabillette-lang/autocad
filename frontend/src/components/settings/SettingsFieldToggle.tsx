import { SettingsCheckbox } from "./SettingsControls";
import SettingsFieldRow from "./SettingsFieldRow";

interface SettingsFieldToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
}

export default function SettingsFieldToggle({
  label,
  description,
  checked,
  disabled = false,
  onChange,
  id,
}: SettingsFieldToggleProps) {
  return (
    <SettingsFieldRow
      label={label}
      description={description}
      id={id}
      controlClassName="settings-field-row__control--toggle"
    >
      <SettingsCheckbox
        checked={checked}
        disabled={disabled}
        ariaLabel={label}
        onChange={onChange}
      />
    </SettingsFieldRow>
  );
}
