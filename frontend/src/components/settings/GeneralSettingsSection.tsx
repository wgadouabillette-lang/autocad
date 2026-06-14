import AccountSettingsSection from "./AccountSettingsSection";
import AudioSettingsSection from "./AudioSettingsSection";
import RecordingSettingsSection from "./RecordingSettingsSection";

export default function GeneralSettingsSection() {
  return (
    <>
      <AccountSettingsSection />
      <AudioSettingsSection />
      <RecordingSettingsSection />
    </>
  );
}
