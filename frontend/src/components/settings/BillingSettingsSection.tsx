import clsx from "clsx";
import { useEffect } from "react";
import { useBilling } from "../../hooks/useBilling";
import { useStore } from "../../store/useStore";
import {
  billingModeLabel,
  canEnableOnDemandUsage,
  planLabel,
} from "../../lib/subscriptionPlans";
import SettingsComingSoon from "./SettingsComingSoon";

export default function BillingSettingsSection() {
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const onDemandUsageEnabled = useStore((s) => s.onDemandUsageEnabled);
  const openSettingsTab = useStore((s) => s.openSettingsTab);
  const onDemandAvailable = canEnableOnDemandUsage(subscriptionPlan);
  const {
    stripeEnabled,
    billingManaged,
    onDemandAvailable: stripeOnDemand,
    proPriceLabel,
    loading,
    error,
    externalCheckoutOpen,
    dismissExternalCheckoutNotice,
    checkoutPro,
    openPortal,
    setOnDemand,
    refreshProfile,
  } = useBilling();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      void refreshProfile();
    }
  }, [refreshProfile]);

  const handleOnDemandToggle = () => {
    if (!onDemandAvailable) return;
    if (stripeEnabled && stripeOnDemand) {
      void setOnDemand(!onDemandUsageEnabled);
      return;
    }
    useStore.getState().toggleOnDemandUsage();
  };

  return (
    <>
      <section className="settings-section settings-section--card">
        <h3 className="settings-section__label">Abonnement</h3>
        <p className="settings-section__hint">
          L&apos;accès à l&apos;IA passe par un abonnement Pro. L&apos;usage à la demande
          (pay-as-you-go) est un complément optionnel — disponible uniquement avec un abonnement
          actif.
        </p>
        {error && <p className="settings-section__hint text-red-400">{error}</p>}
        {externalCheckoutOpen && (
          <p className="settings-section__hint text-amber-300">
            Le paiement s&apos;est ouvert dans votre navigateur. Revenez ici une fois la
            transaction terminée — votre forfait sera mis à jour automatiquement.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-amber-100"
              onClick={dismissExternalCheckoutNotice}
            >
              OK
            </button>
          </p>
        )}
        <dl className="settings-kv">
          <div className="settings-kv__row">
            <dt>Forfait</dt>
            <dd>{planLabel(subscriptionPlan)}</dd>
          </div>
          <div className="settings-kv__row">
            <dt>Facturation</dt>
            <dd>{billingModeLabel(subscriptionPlan, onDemandUsageEnabled)}</dd>
          </div>
        </dl>
        <div className="settings-section__stack">
          {stripeEnabled ? (
            <>
              {subscriptionPlan !== "pro" ? (
                <button
                  type="button"
                  className="settings-option"
                  disabled={loading}
                  onClick={() => void checkoutPro()}
                >
                  <span className="settings-option__title">Souscrire à Pro</span>
                  <span className="settings-option__subtitle">
                    {proPriceLabel} — paiement sécurisé via Stripe Checkout.
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="settings-option"
                  disabled={loading}
                  onClick={() => void openPortal()}
                >
                  <span className="settings-option__title">Gérer l&apos;abonnement</span>
                  <span className="settings-option__subtitle">
                    Moyen de paiement, factures et résiliation via le portail Stripe.
                  </span>
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="settings-option"
              onClick={() => openSettingsTab("usage")}
            >
              <span className="settings-option__title">Abonnement Pro</span>
              <span className="settings-option__subtitle">
                Forfait mensuel — requis pour l&apos;IA.
              </span>
            </button>
          )}
          <button
            type="button"
            disabled={!onDemandAvailable || loading || (stripeEnabled && !stripeOnDemand)}
            onClick={handleOnDemandToggle}
            className={clsx(
              "settings-option",
              onDemandAvailable && onDemandUsageEnabled && "settings-option--active",
              !onDemandAvailable && "opacity-50",
            )}
          >
            <span className="settings-option__title">Usage à la demande</span>
            <span className="settings-option__subtitle">
              {!onDemandAvailable
                ? "Abonnement Pro requis pour activer l'usage à la demande."
                : stripeEnabled && !stripeOnDemand
                  ? "Add-on non configuré côté serveur."
                  : onDemandUsageEnabled
                    ? billingManaged
                      ? "Add-on actif — synchronisé avec Stripe."
                      : "Add-on actif — crédits facturés au fil des requêtes, en plus de l'abonnement."
                    : "Add-on optionnel — crédits consommés au fil des requêtes, en complément du forfait."}
            </span>
          </button>
        </div>
      </section>
      {!stripeEnabled && (
        <SettingsComingSoon detail="Moyen de paiement, factures et historique des transactions." />
      )}
    </>
  );
}
