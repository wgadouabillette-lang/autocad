import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const COLLECTION = "stripeWebhookEvents";
const RETENTION_DAYS = 30;

export class WebhookAlreadyProcessed extends Error {
  constructor(eventId: string) {
    super(`Stripe event already processed: ${eventId}`);
    this.name = "WebhookAlreadyProcessed";
  }
}

export async function claimStripeWebhookEvent(
  eventId: string,
  eventType: string,
): Promise<void> {
  const id = eventId.trim();
  if (!id) {
    throw new Error("Stripe event id is required.");
  }

  const db = getFirestore();
  const ref = db.collection(COLLECTION).doc(id);
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000),
  );

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists) {
      const status = String(snap.data()?.status ?? "");
      if (status === "processed") {
        throw new WebhookAlreadyProcessed(id);
      }
    }
    transaction.set(
      ref,
      {
        eventType,
        status: "processing",
        claimedAt: FieldValue.serverTimestamp(),
        expiresAt,
      },
      { merge: true },
    );
  });
}

export async function markStripeWebhookProcessed(eventId: string): Promise<void> {
  const ref = getFirestore().collection(COLLECTION).doc(eventId.trim());
  await ref.set(
    {
      status: "processed",
      processedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function releaseStripeWebhookClaim(eventId: string): Promise<void> {
  const ref = getFirestore().collection(COLLECTION).doc(eventId.trim());
  const snap = await ref.get();
  if (!snap.exists) return;
  if (String(snap.data()?.status ?? "") !== "processing") return;
  await ref.delete();
}
