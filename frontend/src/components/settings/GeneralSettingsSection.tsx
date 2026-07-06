import AccountSettingsSection from "./AccountSettingsSection";
import AccentColorSettingsSection from "./AccentColorSettingsSection";
import CalendarWorkingHoursSettingsSection from "./CalendarWorkingHoursSettingsSection";

export default function GeneralSettingsSection() {
  return (
    <>
      <AccountSettingsSection />
      <CalendarWorkingHoursSettingsSection />
      <AccentColorSettingsSection />
    </>
  );
}
