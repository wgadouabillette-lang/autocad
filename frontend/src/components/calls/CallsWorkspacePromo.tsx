import { ArrowUpRight, Sparkles, Zap } from "lucide-react";
import { useBilling } from "../../hooks/useBilling";
import { hasPersonalAiAccess } from "../../lib/subscriptionPlans";
import { isMarketingPreview } from "../../lib/marketingPreview";
import { useStore } from "../../store/useStore";

/**
 * Bandeau promo au-dessus des salons vocaux.
 * Masqué si Pro personnel ou si le workspace est déjà boosté (Entreprise).
 *
 * `FORCE_SHOW_FOR_CUSTOMIZE` : laisser à `true` le temps de styler le bandeau,
 * puis remettre à `false` pour la logique payant / boosté.
 */
const FORCE_SHOW_FOR_CUSTOMIZE = true;

export default function CallsWorkspacePromo() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const workspaceEnterpriseActive = useStore((s) => s.workspaceEnterpriseActive);
  const {
    checkoutPro,
    checkoutEnterprise,
    prefetchCheckout,
    enterpriseEnabled,
    loading,
  } = useBilling();

  if (isMarketingPreview()) return null;
  if (!FORCE_SHOW_FOR_CUSTOMIZE) {
    if (hasPersonalAiAccess(subscriptionPlan, billingManaged)) return null;
    if (workspaceEnterpriseActive) return null;
  }

  return (
    <aside className="calls-promo" aria-label="Découvrir Hall Pro et Entreprise">
      <span className="calls-promo__sheen" aria-hidden />
      <Sparkles size={12} strokeWidth={2.25} className="calls-promo__icon" aria-hidden />
      <p className="calls-promo__text">Débloquez l&apos;IA dans Hall</p>
      <div className="calls-promo__actions">
        <button
          type="button"
          className="calls-promo__link"
          disabled={loading}
          onPointerEnter={prefetchCheckout}
          onClick={() => void checkoutPro()}
        >
          <span>Pro</span>
          <ArrowUpRight size={11} strokeWidth={2.25} aria-hidden />
        </button>
        {enterpriseEnabled ? (
          <>
            <span className="calls-promo__sep" aria-hidden />
            <button
              type="button"
              className="calls-promo__link"
              disabled={loading}
              onPointerEnter={prefetchCheckout}
              onClick={() => void checkoutEnterprise()}
            >
              <Zap size={11} strokeWidth={2.25} aria-hidden />
              <span>Booster</span>
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
