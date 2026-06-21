import PlanSettingsSection from "./PlanSettingsSection";
import UsageMeter from "./UsageMeter";
import { usePersonalUsage } from "../../hooks/useUsageStatus";
import { useAuthStore } from "../../store/useAuthStore";
import { useStore } from "../../store/useStore";

export default function UsageSettingsSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const settingsTab = useStore((s) => s.settingsTab);
  const isPro = subscriptionPlan === "pro" && billingManaged;
  const pollEnabled = settingsTab === "usage" && isAuthenticated && isPro;
  const { usage: personalUsage, loading, error } = usePersonalUsage(pollEnabled);

  return (
    <>
      {isPro && (
        <section className="settings-section settings-section--card">
          {loading && !personalUsage && (
            <p className="settings-section__hint">Chargement de l&apos;usage…</p>
          )}
          {error && <p className="settings-section__hint text-red-400">{error}</p>}
          {personalUsage && (
            <UsageMeter
              usage={personalUsage}
              showPercentProminent
              compact
              showAmounts={false}
              showTokens={false}
              showWarning={false}
            />
          )}
        </section>
      )}
      <PlanSettingsSection />
    </>
  );
}
