import DeleteAccountSettingsSection from "./DeleteAccountSettingsSection";
import LanguageSettingsSection from "./LanguageSettingsSection";
import SettingsProfileCard from "./SettingsProfileCard";

export default function GeneralSettingsSection() {
  return (
    <div className="settings-field-list">
      <SettingsProfileCard />
      <div className="settings-field-list__divider" role="presentation" />
      <LanguageSettingsSection />
      <div className="settings-field-list__divider" role="presentation" />
      <DeleteAccountSettingsSection />
    </div>
  );
}
