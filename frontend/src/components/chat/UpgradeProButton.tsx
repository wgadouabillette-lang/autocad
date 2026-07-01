import { ArrowUpRight } from "lucide-react";
import { useBilling } from "../../hooks/useBilling";
import { useStore } from "../../store/useStore";

interface UpgradeProButtonProps {
  label: string;
}

export default function UpgradeProButton({ label }: UpgradeProButtonProps) {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const { stripeEnabled, checkoutPro, openPortal, loading } = useBilling();
  const isPro = subscriptionPlan === "pro" && billingManaged;

  const handleClick = () => {
    if (!stripeEnabled) return;
    if (isPro) {
      void openPortal();
      return;
    }
    void checkoutPro();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!stripeEnabled || loading}
      className="assistant-markdown__upgrade-button"
    >
      <span>{label}</span>
      <ArrowUpRight size={12} aria-hidden />
    </button>
  );
}
