import BillingSettingsSection from "./BillingSettingsSection";
import PlanSettingsSection from "./PlanSettingsSection";

export default function UsageSettingsSection() {
  return (
    <>
      <PlanSettingsSection />
      <BillingSettingsSection />
    </>
  );
}
