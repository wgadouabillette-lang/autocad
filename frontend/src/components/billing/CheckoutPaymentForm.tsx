import {
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  type StripeElementsOptions,
  type StripeExpressCheckoutElementConfirmEvent,
  type StripeExpressCheckoutElementReadyEvent,
} from "@stripe/stripe-js";
import { useCallback, useEffect, useState, type FormEvent } from "react";

/** Sépare « $25 » et « / month » pour un affichage typographique différent. */
export function splitPriceLabel(label: string): { amount: string; frequency: string } {
  const trimmed = label.trim();
  const match = trimmed.match(/^(.+?)\s*(\/\s*.+)$/);
  if (match) {
    return { amount: match[1].trim(), frequency: match[2].replace(/\s+/g, " ").trim() };
  }
  return { amount: trimmed, frequency: "" };
}

/** Pays requis par Stripe si le champ country est en `never` dans Payment Element. */
export function resolveBillingCountry(): string {
  const lang = (typeof navigator !== "undefined" ? navigator.language : "") || "";
  const region = lang.includes("-") ? lang.split("-")[1]?.toUpperCase() : "";
  if (region && /^[A-Z]{2}$/.test(region)) return region;
  return "CA";
}

export const CHECKOUT_ELEMENTS_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "flat",
  labels: "floating",
  rules: {
    ".Input": {
      backgroundColor: "#141414",
      border: "none",
      boxShadow: "none",
      color: "#e8eaed",
    },
    ".Input:focus": {
      border: "none",
      boxShadow: "none",
    },
    ".Tab": {
      backgroundColor: "#1e1e1e",
      border: "none",
      boxShadow: "none",
    },
    ".Tab:hover": {
      backgroundColor: "#141414",
    },
    ".Tab--selected": {
      backgroundColor: "#141414",
      border: "none",
      boxShadow: "none",
      color: "#e8eaed",
    },
    ".Label": {
      color: "rgba(232,234,237,0.65)",
    },
    ".Block": {
      backgroundColor: "#1e1e1e",
      border: "none",
      boxShadow: "none",
    },
  },
};

export function CheckoutOverlaySkeleton() {
  return (
    <div className="pro-checkout-overlay__skeleton" aria-hidden>
      <div className="pro-checkout-overlay__skeleton-header">
        <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--title" />
        <div className="pro-checkout-overlay__skeleton-price">
          <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--amount" />
          <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--freq" />
        </div>
      </div>
      <div className="pro-checkout-overlay__skeleton-body">
        <div className="pro-checkout-overlay__skeleton-express">
          <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--btn" />
          <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--btn" />
        </div>
        <div className="pro-checkout-overlay__skeleton-divider" />
        <div className="pro-checkout-overlay__skeleton-field-wrap">
          <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--label" />
          <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--field" />
        </div>
        <div className="pro-checkout-overlay__skeleton-row">
          <div className="pro-checkout-overlay__skeleton-field-wrap">
            <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--label" />
            <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--field" />
          </div>
          <div className="pro-checkout-overlay__skeleton-field-wrap">
            <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--label" />
            <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--field" />
          </div>
        </div>
        <div className="pro-checkout-overlay__skeleton-block pro-checkout-overlay__skeleton-block--submit" />
      </div>
    </div>
  );
}

export function CheckoutPaymentForm({
  clientSecret,
  onPaid,
  busy,
  onElementsReady,
  submitLabel = "S'abonner",
}: {
  clientSecret: string;
  onPaid: () => void;
  busy: boolean;
  onElementsReady: () => void;
  submitLabel?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expressVisible, setExpressVisible] = useState(false);
  const [expressReady, setExpressReady] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);

  useEffect(() => {
    if (expressReady && paymentReady) onElementsReady();
  }, [expressReady, paymentReady, onElementsReady]);

  const confirmCheckout = useCallback(async () => {
    if (!stripe || !elements) return false;

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Vérifiez les informations de paiement.");
      return false;
    }

    const useSetup = clientSecret.startsWith("seti_");
    const confirmParams = {
      payment_method_data: {
        billing_details: {
          address: {
            country: resolveBillingCountry(),
          },
        },
      },
    };
    const result = useSetup
      ? await stripe.confirmSetup({
          elements,
          redirect: "if_required",
          confirmParams,
        })
      : await stripe.confirmPayment({
          elements,
          redirect: "if_required",
          confirmParams,
        });

    if (result.error) {
      setError(result.error.message ?? "Le paiement a échoué.");
      return false;
    }

    onPaid();
    return true;
  }, [clientSecret, elements, onPaid, stripe]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements || busy) return;

    setSubmitting(true);
    setError(null);
    try {
      const ok = await confirmCheckout();
      if (!ok) setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement impossible.");
      setSubmitting(false);
    }
  };

  const onExpressConfirm = async (_event: StripeExpressCheckoutElementConfirmEvent) => {
    if (!stripe || !elements || busy) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await confirmCheckout();
      if (!ok) setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement impossible.");
      setSubmitting(false);
    }
  };

  const onExpressReady = (event: StripeExpressCheckoutElementReadyEvent) => {
    const methods = event.availablePaymentMethods;
    setExpressVisible(Boolean(methods && (methods.link || methods.paypal)));
    setExpressReady(true);
  };

  const locked = submitting || busy;

  return (
    <form className="pro-checkout-overlay__form" onSubmit={onSubmit}>
      <div
        className={
          expressVisible
            ? "pro-checkout-overlay__express"
            : "pro-checkout-overlay__express pro-checkout-overlay__express--pending"
        }
      >
        <ExpressCheckoutElement
          options={{
            paymentMethods: {
              applePay: "never",
              googlePay: "never",
              amazonPay: "never",
              klarna: "never",
              link: "auto",
              paypal: "auto",
            },
            paymentMethodOrder: ["link", "paypal"],
            layout: {
              maxColumns: 1,
              maxRows: 2,
              overflow: "auto",
            },
            buttonHeight: 44,
            buttonType: {
              paypal: "paypal",
            },
          }}
          onReady={onExpressReady}
          onConfirm={onExpressConfirm}
        />
      </div>

      {expressVisible ? (
        <div className="pro-checkout-overlay__divider" aria-hidden>
          <span>ou carte</span>
        </div>
      ) : null}

      <div className="pro-checkout-overlay__element">
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: {
              applePay: "never",
              googlePay: "never",
              link: "never",
            },
            fields: {
              billingDetails: {
                address: {
                  country: "never",
                },
              },
            },
          }}
          onReady={() => setPaymentReady(true)}
        />
      </div>
      {error ? <p className="pro-checkout-overlay__error">{error}</p> : null}
      <div className="pro-checkout-overlay__actions">
        <button
          type="submit"
          className="workspace-modal__cta workspace-modal__cta--primary pro-checkout-overlay__submit"
          disabled={!stripe || !elements || locked || !expressReady || !paymentReady}
        >
          {submitting ? "Paiement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
