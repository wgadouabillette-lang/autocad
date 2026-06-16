import clsx from "clsx";
import {
  resolveEffectiveTheme,
  type ColorThemePreference,
} from "../../lib/theme";
import { useStore } from "../../store/useStore";

const THEME_OPTIONS: {
  id: ColorThemePreference;
  title: string;
  description: string;
}[] = [
  {
    id: "dark",
    title: "Dark",
    description: "Neutral gray palette on dark backgrounds.",
  },
  {
    id: "light",
    title: "Light",
    description: "Same hues inverted on light backgrounds.",
  },
  {
    id: "system",
    title: "System",
    description: "Light from 7:00 to 19:00, dark otherwise.",
  },
];

export default function ThemeSettingsSection() {
  const colorTheme = useStore((s) => s.colorTheme);
  const setColorTheme = useStore((s) => s.setColorTheme);
  const effectiveTheme = resolveEffectiveTheme(colorTheme);

  return (
    <section className="settings-section">
      <h3 className="settings-section__label">Theme</h3>
      <p className="settings-section__hint">
        Choose how Lyte looks across the app. Light mode mirrors the dark palette with inverted
        contrast.
      </p>

      <div className="settings-section__stack">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setColorTheme(option.id)}
            className={clsx(
              "settings-option",
              colorTheme === option.id && "settings-option--active",
            )}
          >
            <span className="settings-option__title">{option.title}</span>
            <span className="settings-option__subtitle">{option.description}</span>
          </button>
        ))}
      </div>

      <p className="settings-section__meta">
        Active appearance:{" "}
        <span className="text-muted-300">
          {effectiveTheme === "light" ? "Light" : "Dark"}
          {colorTheme === "system" ? " (system schedule)" : ""}
        </span>
      </p>
    </section>
  );
}
