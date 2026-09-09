import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_LOCALES,
  APP_LOCALE_LABELS,
  type LocalePreference,
} from "../../lib/appLocale";
import { useStore } from "../../store/useStore";
import SettingsPicker from "./SettingsControls";

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
    <section className="settings-profile-card__block" id="app-language">
      <div className="settings-profile-card__block-head">
        <h3 className="settings-profile-card__label">{t("settings.language.title")}</h3>
        <p className="settings-profile-card__hint">{t("settings.language.hint")}</p>
      </div>
      <SettingsPicker
        value={locale}
        ariaLabel={t("settings.language.aria")}
        options={options}
        onChange={(value) => setLocale(value as LocalePreference)}
      />
    </section>
  );
}
