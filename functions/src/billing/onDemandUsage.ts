import { FieldValue, getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(key);
}

function onDemandUnitCents(): number {
  const raw = Number.parseInt(process.env.STRIPE_ON_DEMAND_UNIT_CENTS ?? "1", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function overageUnits(overageUsd: number): number {
  const unitCents = onDemandUnitCents();
  const overageCents = Math.max(0, overageUsd) * 100;
  return Math.max(0, Math.ceil(overageCents / unitCents));
}

async function loadUserBilling(uid: string): Promise<Record<string, unknown>> {
  const snap = await getFirestore().doc(`users/${uid}/private/billing`).get();
  return (snap.data() ?? {}) as Record<string, unknown>;
}

export async function reportOnDemandStripeUsage(
  uid: string,
  onDemandUsedUsd: number,
): Promise<void> {
  const onDemandPrice = process.env.STRIPE_ON_DEMAND_PRICE_ID?.trim();
  if (!onDemandPrice) return;

  const targetUnits = overageUnits(onDemandUsedUsd);
  if (targetUnits <= 0) return;

  const billing = await loadUserBilling(uid);
  const itemId = String(billing.stripeOnDemandItemId ?? "").trim();
  if (!itemId) return;

  const reported = Number(billing.stripeOnDemandUnitsReported ?? 0);
  const delta = targetUnits - reported;
  if (delta <= 0) return;

  const stripe = stripeClient();
  await stripe.subscriptionItems.createUsageRecord(itemId, {
    quantity: delta,
    action: "increment",
    timestamp: Math.floor(Date.now() / 1000),
  });

  await getFirestore()
    .doc(`users/${uid}/private/billing`)
    .set(
      {
        stripeOnDemandUnitsReported: targetUnits,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

export async function resetOnDemandStripeReporting(uid: string): Promise<void> {
  await getFirestore()
    .doc(`users/${uid}/private/billing`)
    .set(
      {
        stripeOnDemandUnitsReported: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}
