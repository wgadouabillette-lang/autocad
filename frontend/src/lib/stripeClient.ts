import { loadStripe, type Stripe } from "@stripe/stripe-js";

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

/** Charge Stripe.js tôt (évite de bloquer le rendu au moment du checkout). */
export function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  const key = publishableKey.trim();
  if (!key) return Promise.resolve(null);
  let cached = stripePromiseCache.get(key);
  if (!cached) {
    cached = loadStripe(key);
    stripePromiseCache.set(key, cached);
  }
  return cached;
}

/** Prefetch non-bloquant dès que la clé publique est connue. */
export function warmStripeJs(publishableKey: string | null | undefined): void {
  const key = (publishableKey || "").trim();
  if (!key) return;
  void getStripePromise(key);
}
