import { useState } from "react";
import { X, Zap } from "lucide-react";
import { useBilling } from "../../hooks/useBilling";
import {
  dismissCallsWorkspacePromo,
  isCallsWorkspacePromoDismissed,
} from "../../lib/callsWorkspacePromo";
import { isMarketingPreview } from "../../lib/marketingPreview";
import { useStore } from "../../store/useStore";

/**
 * Bandeau promo Boost au-dessus des salons vocaux.
 * Masqué si le workspace est déjà boosté, si Entreprise n'est pas dispo,
 * ou pendant le cooldown après dismiss (X au hover).
 */
export default function CallsWorkspacePromo() {
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const { checkoutEnterprise, prefetchCheckout, enterpriseEnabled, loading } = useBilling();
  const [dismissed, setDismissed] = useState(() => isCallsWorkspacePromoDismissed());

  if (isMarketingPreview()) return null;
  if (dismissed) return null;
  if (workspaceEnterpriseActive) return null;
  if (!enterpriseEnabled) return null;

  const handleDismiss = () => {
    dismissCallsWorkspacePromo();
    setDismissed(true);
  };

  return (
    <aside className="calls-promo" aria-label="Booster le workspace">
      <span className="calls-promo__sheen" aria-hidden />
      <Zap size={12} strokeWidth={2.25} className="calls-promo__icon" aria-hidden />
      <p className="calls-promo__text">Boostez ce workspace</p>
      <div className="calls-promo__actions">
        <button
          type="button"
          className="calls-promo__link"
          disabled={loading}
          onPointerEnter={prefetchCheckout}
          onClick={() => void checkoutEnterprise()}
        >
          <span>Boost</span>
        </button>
      </div>
      <button
        type="button"
        className="calls-promo__dismiss"
        aria-label="Masquer la promotion"
        title="Masquer"
        onClick={handleDismiss}
      >
        <X size={10} strokeWidth={2.5} aria-hidden />
      </button>
    </aside>
  );
}
