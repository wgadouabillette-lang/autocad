import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SettingsProfileHeaderProps {
  onBack: () => void;
}

export default function SettingsProfileHeader({ onBack }: SettingsProfileHeaderProps) {
  const { t } = useTranslation();

  return (
    <button type="button" className="settings-view__back" onClick={onBack}>
      <ChevronLeft size={16} strokeWidth={2.25} aria-hidden />
      <span>{t("settings.backToApp")}</span>
    </button>
  );
}
