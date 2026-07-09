import clsx from "clsx";
import type { ReactNode } from "react";

export interface SettingsFieldRowProps {
  label: string;
  description?: string;
  children: ReactNode;
  error?: string | null;
  id?: string;
  controlClassName?: string;
}

export default function SettingsFieldRow({
  label,
  description,
  children,
  error,
  id,
  controlClassName,
}: SettingsFieldRowProps) {
  return (
    <section className="settings-field-row" id={id}>
      <div className="settings-field-row__info">
        <h3 className="settings-field-row__label">{label}</h3>
        {description ? <p className="settings-field-row__desc">{description}</p> : null}
      </div>
      <div className={clsx("settings-field-row__control", controlClassName)}>{children}</div>
      {error ? <p className="settings-field-row__error">{error}</p> : null}
    </section>
  );
}
