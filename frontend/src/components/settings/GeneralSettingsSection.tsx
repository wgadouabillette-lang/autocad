import AccountSettingsSection from "./AccountSettingsSection";
import AccentColorSettingsSection from "./AccentColorSettingsSection";
import CalendarWorkingHoursSettingsSection from "./CalendarWorkingHoursSettingsSection";

export default function GeneralSettingsSection() {
  return (
    <div className="settings-field-list">
      <AccountSettingsSection />
      <div className="settings-field-list__divider" role="presentation" />
      <CalendarWorkingHoursSettingsSection />
      <AccentColorSettingsSection />
    </div>
  );
}
