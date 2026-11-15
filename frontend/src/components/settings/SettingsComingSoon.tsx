import { useTranslation } from "react-i18next";

export default function SettingsComingSoon({ detail }: { detail?: string }) {
  const { t } = useTranslation();
  return (
    <section className="settings-section">
      <p className="settings-coming-soon">{t("settingsUi.comingSoon")}</p>
      {detail && <p className="settings-section__hint">{detail}</p>}
    </section>
  );
}
