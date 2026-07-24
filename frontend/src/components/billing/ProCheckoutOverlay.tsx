import { Elements } from "@stripe/react-stripe-js";
import { type StripeElementsOptions } from "@stripe/stripe-js";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { billingApi } from "../../lib/billingApi";
import {
  effectiveOnDemandUsage,
  effectiveSubscriptionPlan,
} from "../../lib/subscriptionPlans";
import { getStripePromise } from "../../lib/stripeClient";
import { useLocalizedUsdPrice } from "../../hooks/useLocalizedUsdPrice";
import { useProCheckoutStore } from "../../store/useProCheckoutStore";
import { useStore } from "../../store/useStore";
import {
  CHECKOUT_ELEMENTS_APPEARANCE,
  CheckoutOverlaySkeleton,
  CheckoutPaymentForm,
  splitPriceLabel,
} from "./CheckoutPaymentForm";

export default function ProCheckoutOverlay() {
  const open = useProCheckoutStore((s) => s.open);
  const closeCheckout = useProCheckoutStore((s) => s.closeCheckout);
  const subscriptionPlan = useStore((s) => s.subscriptionPlan);
  const billingManaged = useStore((s) => s.billingManaged);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [priceLabel, setPriceLabel] = useState("$25 / month");
  const [usdCents, setUsdCents] = useState(2500);
  const { localized } = useLocalizedUsdPrice(open ? usdCents : null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  /** Paiement Stripe OK côté client — on attend le webhook / profil Pro. */
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [elementsReady, setElementsReady] = useState(false);

  const reset = useCallback(() => {
    setClientSecret(null);
    setPublishableKey(null);
    setIntentError(null);
    setLoadingIntent(false);
    setAwaitingWebhook(false);
    setActivationError(null);
    setElementsReady(false);
  }, []);

  const onElementsReady = useCallback(() => {
    setElementsReady(true);
  }, []);

  const finishOpen = useCallback(() => {
    closeCheckout();
    reset();
  }, [closeCheckout, reset]);

  const close = useCallback(() => {
    if (awaitingWebhook && !activationError) return;
    finishOpen();
  }, [awaitingWebhook, activationError, finishOpen]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !awaitingWebhook) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, awaitingWebhook]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

    let cancelled = false;
    setLoadingIntent(true);
    setIntentError(null);
    setAwaitingWebhook(false);
    setElementsReady(false);

    void (async () => {
      try {
        const config = await billingApi.config();
        if (!cancelled) {
          if (config.proPriceLabel) setPriceLabel(config.proPriceLabel);
          if (typeof config.proPriceUsdCents === "number") {
            setUsdCents(config.proPriceUsdCents);
          }
        }
        const intent = await billingApi.checkoutProIntent();
        if (cancelled) return;
        setClientSecret(intent.clientSecret);
        setPublishableKey(intent.publishableKey);
        setLoadingIntent(false);
      } catch (err) {
        if (cancelled) return;
        setIntentError(err instanceof Error ? err.message : "Impossible de démarrer le paiement.");
        setLoadingIntent(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, reset]);

  // Fermer quand le profil / store passe Pro (webhook).
  useEffect(() => {
    if (!open || !awaitingWebhook) return;
    if (subscriptionPlan === "pro" && billingManaged) {
      finishOpen();
    }
  }, [open, awaitingWebhook, subscriptionPlan, billingManaged, finishOpen]);

  // Filet de sécurité : sans `stripe listen`, le webhook n'arrive pas en local.
  // Après confirmPayment, on poll /sync jusqu'à ce que Stripe marque l'abo actif.
  useEffect(() => {
    if (!open || !awaitingWebhook || activationError) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 12;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const status = await billingApi.sync();
        if (cancelled) return;
        const plan = effectiveSubscriptionPlan(status.subscriptionPlan, status.billingManaged);
        if (plan === "pro" && status.billingManaged) {
          useStore.setState({
            subscriptionPlan: plan,
            billingManaged: true,
            onDemandUsageEnabled: effectiveOnDemandUsage(
              plan,
              status.onDemandUsageEnabled,
              status.billingManaged,
            ),
          });
          finishOpen();
          return;
        }
      } catch {
        /* retry */
      }
      if (cancelled) return;
      if (attempts >= maxAttempts) {
        setActivationError(
          "Paiement reçu, mais l'activation Pro tarde. Vérifiez que le webhook Stripe tourne (`stripe listen`), puis rouvrez l'app.",
        );
        return;
      }
      window.setTimeout(() => {
        void tick();
      }, 1500);
    };

    const initial = window.setTimeout(() => {
      void tick();
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
    };
  }, [open, awaitingWebhook, activationError, finishOpen]);

  const stripePromise = useMemo(
    () => (publishableKey ? getStripePromise(publishableKey) : null),
    [publishableKey],
  );

  const elementsOptions = useMemo<StripeElementsOptions | null>(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      appearance: CHECKOUT_ELEMENTS_APPEARANCE,
    };
  }, [clientSecret]);

  const onPaid = useCallback(() => {
    setActivationError(null);
    setAwaitingWebhook(true);
  }, []);

  if (!open) return null;

  const { amount: priceAmount, frequency: priceFrequency } = splitPriceLabel(priceLabel);
  const displayAmount = localized?.amountLabel ?? priceAmount;
  const displayFrequency = localized?.frequencyLabel ?? priceFrequency;
  const showShimmer = !awaitingWebhook && !intentError && (loadingIntent || !elementsReady);

  return createPortal(
    <div
      className="workspace-modal pro-checkout-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Passer à Pro"
    >
      <button
        type="button"
        className="workspace-modal__backdrop"
        aria-label={awaitingWebhook ? "Activation en cours" : "Fermer"}
        onClick={awaitingWebhook ? undefined : close}
      />
      <div className="workspace-modal__card pro-checkout-overlay__card">
        <div className="pro-checkout-overlay__content">
          {!awaitingWebhook ? (
            <button
              type="button"
              className="workspace-modal__close"
              onClick={close}
              aria-label="Fermer"
            >
              <X size={18} aria-hidden />
            </button>
          ) : null}

          {awaitingWebhook ? (
            <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body">
              <p className="workspace-modal__empty">
                {activationError
                  ? activationError
                  : "Paiement reçu — activation de Pro en cours…"}
              </p>
              {activationError ? (
                <button
                  type="button"
                  className="workspace-modal__cta workspace-modal__cta--secondary"
                  onClick={finishOpen}
                >
                  Fermer
                </button>
              ) : null}
            </div>
          ) : intentError ? (
            <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body">
              <p className="pro-checkout-overlay__error">{intentError}</p>
              <button
                type="button"
                className="workspace-modal__cta workspace-modal__cta--secondary"
                onClick={close}
              >
                Fermer
              </button>
            </div>
          ) : (
            <div className="pro-checkout-overlay__load-shell" aria-busy={showShimmer}>
              {showShimmer ? <CheckoutOverlaySkeleton /> : null}
              <div
                className={
                  showShimmer
                    ? "pro-checkout-overlay__live pro-checkout-overlay__live--loading"
                    : "pro-checkout-overlay__live"
                }
              >
                <header className="workspace-modal__header pro-checkout-overlay__header">
                  <h2 className="workspace-modal__title">Passer à Pro</h2>
                  <p className="pro-checkout-overlay__price">
                    <span className="pro-checkout-overlay__price-amount">{displayAmount}</span>
                    {displayFrequency ? (
                      <span className="pro-checkout-overlay__price-frequency">{displayFrequency}</span>
                    ) : null}
                  </p>
                  {localized?.converted ? (
                    <p className="pro-checkout-overlay__workspace-hint">
                      Tarif de base {localized.usdLabel} US — affiché dans votre devise
                    </p>
                  ) : null}
                </header>
                <div className="workspace-modal__scroll workspace-modal__scroll--form pro-checkout-overlay__body">
                  {stripePromise && elementsOptions ? (
                    <Elements stripe={stripePromise} options={elementsOptions}>
                      <CheckoutPaymentForm
                        clientSecret={clientSecret!}
                        onPaid={onPaid}
                        busy={awaitingWebhook}
                        onElementsReady={onElementsReady}
                      />
                    </Elements>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
