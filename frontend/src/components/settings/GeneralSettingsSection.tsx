import AccountSettingsSection from "./AccountSettingsSection";
import AccentColorSettingsSection from "./AccentColorSettingsSection";
import CalendarWorkingHoursSettingsSection from "./CalendarWorkingHoursSettingsSection";
import ThemeSettingsSection from "./ThemeSettingsSection";

export default function GeneralSettingsSection() {
  return (
    <>
      <AccountSettingsSection />
      <CalendarWorkingHoursSettingsSection />
      <AccentColorSettingsSection />
      <ThemeSettingsSection />
    </>
  );
}
