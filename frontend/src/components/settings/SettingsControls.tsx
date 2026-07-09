import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface SettingsPickerOption {
  value: string;
  label: string;
}

export interface SettingsPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: SettingsPickerOption[];
  disabled?: boolean;
  ariaLabel: string;
  prefix?: ReactNode;
}

export default function SettingsPicker({
  value,
  onChange,
  options,
  disabled = false,
  ariaLabel,
  prefix,
}: SettingsPickerProps) {
  return (
    <div className={clsx("settings-picker", prefix && "settings-picker--with-prefix")}>
      {prefix ? <span className="settings-picker__prefix">{prefix}</span> : null}
      <div className="settings-picker__field">
        <select
          className="settings-picker__select"
          value={value}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} strokeWidth={2.25} className="settings-picker__chevron" aria-hidden />
      </div>
    </div>
  );
}

export interface SettingsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}

export function SettingsCheckbox({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: SettingsCheckboxProps) {
  return (
    <label className={clsx("settings-checkbox", disabled && "settings-checkbox--disabled")}>
      <input
        type="checkbox"
        className="settings-checkbox__input sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="settings-checkbox__box" aria-hidden>
        {checked ? <Check size={12} strokeWidth={2.75} /> : null}
      </span>
    </label>
  );
}

export function SettingsTimeInput({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  step = 300,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  step?: number;
}) {
  return (
    <div className="settings-picker__field">
      <input
        type="time"
        className="settings-picker__select settings-picker__time"
        value={value}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
