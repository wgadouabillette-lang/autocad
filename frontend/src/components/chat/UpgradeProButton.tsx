import { ArrowUpRight } from "lucide-react";
import { useBilling } from "../../hooks/useBilling";

interface UpgradeProButtonProps {
  label: string;
}

export default function UpgradeProButton({ label }: UpgradeProButtonProps) {
  const { checkoutPro, loading } = useBilling();

  return (
    <button
      type="button"
      onClick={() => void checkoutPro()}
      disabled={loading}
      className="assistant-markdown__upgrade-button"
    >
      <span>{label}</span>
      <ArrowUpRight size={12} aria-hidden />
    </button>
  );
}
