import { ACCENT_COLOR_OPTIONS } from "../../lib/accentColor";
import { useStore } from "../../store/useStore";
import SettingsFieldRow from "./SettingsFieldRow";
import SettingsPicker from "./SettingsControls";

export default function AccentColorSettingsSection() {
  const accentColor = useStore((s) => s.accentColor);
  const setAccentColor = useStore((s) => s.setAccentColor);
  const selected =
    ACCENT_COLOR_OPTIONS.find((option) => option.id === accentColor) ?? ACCENT_COLOR_OPTIONS[0]!;

  return (
    <SettingsFieldRow
      label="Accent color"
      description="Couleur des boutons, bulles de chat et contrôles principaux."
    >
      <SettingsPicker
        value={accentColor}
        ariaLabel="Couleur d'accent"
        prefix={
          <span
            className="settings-picker__swatch"
            style={{ backgroundColor: selected.swatch }}
          />
        }
        options={ACCENT_COLOR_OPTIONS.map((option) => ({
          value: option.id,
          label: option.title,
        }))}
        onChange={(value) => setAccentColor(value as typeof accentColor)}
      />
    </SettingsFieldRow>
  );
}
