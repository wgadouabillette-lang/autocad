import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_LOCALES,
  APP_LOCALE_LABELS,
  type LocalePreference,
} from "../../lib/appLocale";
import { useStore } from "../../store/useStore";
import SettingsPicker from "./SettingsControls";
import SettingsFieldRow from "./SettingsFieldRow";

export default function LanguageSettingsSection() {
  const { t } = useTranslation();
  const locale = useStore((s) => s.locale);
  const setLocale = useStore((s) => s.setLocale);

  const options = useMemo(
    () => [
      { value: "system", label: t("common.system") },
      ...APP_LOCALES.map((code) => ({
        value: code,
        label: APP_LOCALE_LABELS[code],
      })),
    ],
    [t],
  );

  return (
    <section className="settings-preferences__group">
      <h3 className="settings-preferences__title">{t("settings.language.title")}</h3>
      <div className="settings-field-list">
        <SettingsFieldRow id="app-language" label="Interface" description={t("settings.language.hint")}>
          <SettingsPicker
            value={locale}
            ariaLabel={t("settings.language.aria")}
            options={options}
            onChange={(value) => setLocale(value as LocalePreference)}
          />
        </SettingsFieldRow>
      </div>
    </section>
  );
}
