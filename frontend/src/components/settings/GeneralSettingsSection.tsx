import DeleteAccountSettingsSection from "./DeleteAccountSettingsSection";
import LanguageSettingsSection from "./LanguageSettingsSection";
import SettingsProfileCard from "./SettingsProfileCard";

export default function GeneralSettingsSection() {
  return (
    <div className="settings-preferences">
      <SettingsProfileCard />
      <LanguageSettingsSection />
      <DeleteAccountSettingsSection />
    </div>
  );
}
