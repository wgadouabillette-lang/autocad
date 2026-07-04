import { useStore } from "../../store/useStore";

interface UpgradeProButtonProps {
  label: string;
}

export default function UpgradeProButton({ label }: UpgradeProButtonProps) {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);
  const isPro = subscriptionPlan === "pro" && billingManaged;

  if (isPro) return null;

  return (
    <button
      type="button"
      onClick={() => setSubscriptionPlan("pro")}
      className="assistant-markdown__upgrade-button"
    >
      <span>{label}</span>
    </button>
  );
}
