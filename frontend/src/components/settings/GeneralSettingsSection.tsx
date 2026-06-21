import AccountSettingsSection from "./AccountSettingsSection";
import CalendarWorkingHoursSettingsSection from "./CalendarWorkingHoursSettingsSection";
import ThemeSettingsSection from "./ThemeSettingsSection";

export default function GeneralSettingsSection() {
  return (
    <>
      <AccountSettingsSection />
      <CalendarWorkingHoursSettingsSection />
      <ThemeSettingsSection />
    </>
  );
}
