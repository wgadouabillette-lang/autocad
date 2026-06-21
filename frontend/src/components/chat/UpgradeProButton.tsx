import { ArrowUpRight } from "lucide-react";
import { useStore } from "../../store/useStore";

interface UpgradeProButtonProps {
  label: string;
}

/**
 * Bouton qui basculerait l'utilisateur vers Pro.
 * Stripe est temporairement désactivé — on flippe `subscriptionPlan` localement.
 */
export default function UpgradeProButton({ label }: UpgradeProButtonProps) {
  const setSubscriptionPlan = useStore((s) => s.setSubscriptionPlan);

  const handleClick = () => {
    setSubscriptionPlan("pro");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="assistant-markdown__upgrade-button"
    >
      <span>{label}</span>
      <ArrowUpRight size={12} aria-hidden />
    </button>
  );
}
