import clsx from "clsx";
import { ACCENT_COLOR_OPTIONS } from "../../lib/accentColor";
import { useStore } from "../../store/useStore";

export default function AccentColorSettingsSection() {
  const accentColor = useStore((s) => s.accentColor);
  const setAccentColor = useStore((s) => s.setAccentColor);

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Accent color</h3>
      <p className="settings-section__hint">
        Choose the color for header buttons, chat bubbles, and other primary controls.
      </p>

      <div className="settings-accent-grid">
        {ACCENT_COLOR_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setAccentColor(option.id)}
            className={clsx(
              "settings-accent-option",
              accentColor === option.id && "settings-accent-option--active",
            )}
            aria-pressed={accentColor === option.id}
          >
            <span
              className="settings-accent-option__swatch"
              style={{ backgroundColor: option.swatch }}
              aria-hidden
            />
            <span className="settings-accent-option__label">{option.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
