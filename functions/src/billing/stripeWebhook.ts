import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { ensureFunctionsSecretsLoaded } from "../loadSecrets";
import { FUNCTIONS_REGION } from "../region";
import {
  WebhookAlreadyProcessed,
  claimStripeWebhookEvent,
  markStripeWebhookProcessed,
  releaseStripeWebhookClaim,
} from "./webhookEvents";

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  return new Stripe(key);
}

function billingRef(uid: string) {
  return db.doc(`users/${uid}/private/billing`);
}

function workspaceBillingRef(workspaceId: string) {
  return db.doc(`workspacesShared/${workspaceId}/private/billing`);
}

async function saveUserBilling(uid: string, data: Record<string, unknown>): Promise<void> {
  await billingRef(uid).set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function saveWorkspaceBilling(
  workspaceId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await workspaceBillingRef(workspaceId).set(
    { ...data, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

async function updateUserSubscriptionProfile(
  uid: string,
  subscriptionPlan: string,
  onDemandUsageEnabled: boolean,
): Promise<void> {
  await db.doc(`users/${uid}`).set(
    {
      subscriptionPlan,
      onDemandUsageEnabled,
      billingManaged: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function updateWorkspaceEnterpriseProfile(
  workspaceId: string,
  subscriptionPlan: string,
  memberCount?: number,
  seatCount?: number,
): Promise<void> {
  const payload: Record<string, unknown> = {
    enterpriseSubscriptionPlan: subscriptionPlan,
    enterpriseBillingManaged: true,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (memberCount !== undefined) payload.enterpriseMemberCount = memberCount;
  if (seatCount !== undefined) payload.enterpriseSeatCount = seatCount;
  await db.doc(`workspacesShared/${workspaceId}`).set(payload, { merge: true });
}

async function countWorkspaceMembers(workspaceId: string): Promise<number> {
  const wid = workspaceId.trim().toLowerCase();
  const snap = await db.doc(`workspacesShared/${wid}`).get();
  if (!snap.exists) return 0;
  const ownerId = String(snap.data()?.ownerId ?? "").trim();
  const memberUids = new Set<string>();
  if (ownerId) memberUids.add(ownerId);
  const members = await db.collection(`workspacesShared/${wid}/members`).get();
  for (const doc of members.docs) {
    const uid = String(doc.data().uid ?? doc.id ?? "").trim();
    if (uid) memberUids.add(uid);
  }
  return memberUids.size;
}

async function findUidByStripeCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const snap = await db
    .collectionGroup("private")
    .where("stripeCustomerId", "==", customerId)
    .limit(10)
    .get();
  for (const doc of snap.docs) {
    const userRef = doc.ref.parent.parent;
    if (userRef?.parent.id === "users") return userRef.id;
  }
  return null;
}

async function findWorkspaceByStripeCustomer(customerId: string): Promise<string | null> {
  if (!customerId) return null;
  const snap = await db
    .collectionGroup("private")
    .where("stripeCustomerId", "==", customerId)
    .limit(10)
    .get();
  for (const doc of snap.docs) {
    const workspaceRef = doc.ref.parent.parent;
    if (workspaceRef?.parent.id === "workspacesShared") return workspaceRef.id;
  }
  return null;
}

function resolveUid(params: {
  metadata?: Stripe.Metadata | null;
  clientReferenceId?: string | null;
  customerId?: string | null;
}): Promise<string | null> {
  const meta = params.metadata ?? {};
  const uidFromMeta = (meta.firebase_uid || meta.firebaseUid || "").trim();
  if (uidFromMeta) return Promise.resolve(uidFromMeta);

  const ref = (params.clientReferenceId || "").trim();
  if (ref && !ref.includes(":")) return Promise.resolve(ref);

  if (params.customerId) {
    return findUidByStripeCustomer(params.customerId);
  }
  return Promise.resolve(null);
}

function resolveWorkspaceId(metadata?: Stripe.Metadata | null): string | null {
  const meta = metadata ?? {};
  const workspaceId = (meta.workspace_id || meta.workspaceId || "").trim().toLowerCase();
  return workspaceId || null;
}

function isEnterpriseIntent(metadata?: Stripe.Metadata | null): boolean {
  const meta = metadata ?? {};
  const intent = (meta.intent || "").trim().toLowerCase();
  return intent === "enterprise" || Boolean(resolveWorkspaceId(meta));
}

function subscriptionState(subscription: Stripe.Subscription): {
  plan: string;
  onDemand: boolean;
  onDemandItemId: string;
} {
  const status = subscription.status ?? "";
  const proPrice = process.env.STRIPE_PRO_PRICE_ID?.trim() ?? "";
  const onDemandPrice = process.env.STRIPE_ON_DEMAND_PRICE_ID?.trim() ?? "";
  let hasPro = false;
  let hasOnDemand = false;
  let onDemandItemId = "";

  for (const item of subscription.items?.data ?? []) {
    const priceId = item.price?.id ?? "";
    if (priceId === proPrice) hasPro = true;
    if (onDemandPrice && priceId === onDemandPrice) {
      hasOnDemand = true;
      onDemandItemId = item.id;
    }
  }

  const isActive = ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  const plan = isActive && hasPro ? "pro" : "free";
  const onDemand = isActive && hasPro && hasOnDemand;
  return { plan, onDemand, onDemandItemId };
}

function enterpriseSubscriptionState(subscription: Stripe.Subscription): {
  plan: string;
  seatCount: number;
} {
  const status = subscription.status ?? "";
  const enterprisePrice = process.env.STRIPE_ENTERPRISE_SEAT_PRICE_ID?.trim() ?? "";
  let hasEnterprise = false;
  let seatCount = 0;

  for (const item of subscription.items?.data ?? []) {
    const priceId = item.price?.id ?? "";
    if (priceId === enterprisePrice) {
      hasEnterprise = true;
      seatCount = item.quantity ?? 0;
    }
  }

  const isActive = ACTIVE_SUBSCRIPTION_STATUSES.has(status);
  const plan = isActive && hasEnterprise ? "enterprise" : "free";
  return { plan, seatCount };
}

async function syncSubscriptionForUid(uid: string, subscription: Stripe.Subscription): Promise<void> {
  const { plan, onDemand, onDemandItemId } = subscriptionState(subscription);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? "";

  await updateUserSubscriptionProfile(uid, plan, onDemand);
  await saveUserBilling(uid, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeOnDemandItemId: onDemandItemId,
    stripeSubscriptionStatus: subscription.status ?? "",
  });
  if (plan === "pro") {
    const { maybeSyncUsagePeriod } = await import("../ai/usage");
    await maybeSyncUsagePeriod(uid, subscription);
  }
}

async function syncEnterpriseSubscriptionForWorkspace(
  workspaceId: string,
  subscription: Stripe.Subscription,
  paidByUid?: string | null,
): Promise<void> {
  const { plan, seatCount } = enterpriseSubscriptionState(subscription);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? "";
  const memberCount = await countWorkspaceMembers(workspaceId);

  await updateWorkspaceEnterpriseProfile(
    workspaceId,
    plan,
    memberCount,
    seatCount || memberCount,
  );
  await saveWorkspaceBilling(workspaceId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status ?? "",
    seatCount: seatCount || memberCount,
    ...(paidByUid ? { paidByUid } : {}),
  });
  if (plan === "enterprise") {
    const { maybeSyncWorkspaceUsagePeriod } = await import("../ai/usage");
    await maybeSyncWorkspaceUsagePeriod(workspaceId, subscription, seatCount || memberCount);
  }
}

function validateCheckoutSession(session: Stripe.Checkout.Session): void {
  if (session.mode !== "subscription") {
    throw new Error(`Unexpected checkout mode: ${session.mode ?? ""}`);
  }
  const paymentStatus = session.payment_status ?? "";
  if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    throw new Error(`Checkout session not paid: ${paymentStatus}`);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  validateCheckoutSession(session);
  const metadata = session.metadata ?? {};
  const workspaceId = resolveWorkspaceId(metadata);
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? "";
  const uid = await resolveUid({
    metadata,
    clientReferenceId: session.client_reference_id,
    customerId,
  });

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? "";
  if (!subscriptionId) return;

  const stripe = stripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });

  if (isEnterpriseIntent(metadata) && workspaceId) {
    if (customerId) {
      await saveWorkspaceBilling(workspaceId, { stripeCustomerId: customerId });
    }
    await syncEnterpriseSubscriptionForWorkspace(workspaceId, subscription, uid);
    return;
  }

  if (!uid) {
    console.warn("checkout.session.completed without firebase uid:", session.id);
    return;
  }

  if (customerId) {
    await saveUserBilling(uid, { stripeCustomerId: customerId });
  }
  await syncSubscriptionForUid(uid, subscription);
}

async function handleSubscriptionEvent(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata ?? {};
  let workspaceId = resolveWorkspaceId(metadata);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? "";

  if (isEnterpriseIntent(metadata) && workspaceId) {
    await syncEnterpriseSubscriptionForWorkspace(workspaceId, subscription);
    return;
  }

  if (!workspaceId && customerId) {
    workspaceId = await findWorkspaceByStripeCustomer(customerId);
  }
  if (workspaceId) {
    const enterprisePrice = process.env.STRIPE_ENTERPRISE_SEAT_PRICE_ID?.trim() ?? "";
    for (const item of subscription.items?.data ?? []) {
      if ((item.price?.id ?? "") === enterprisePrice) {
        await syncEnterpriseSubscriptionForWorkspace(workspaceId, subscription);
        return;
      }
    }
  }

  let uid = await resolveUid({ metadata, customerId });
  if (!uid && customerId) {
    uid = await findUidByStripeCustomer(customerId);
  }
  if (!uid) {
    console.warn("subscription event without firebase uid:", subscription.id);
    return;
  }
  await syncSubscriptionForUid(uid, subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata ?? {};
  let workspaceId = resolveWorkspaceId(metadata);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? "";

  if (!workspaceId && customerId) {
    workspaceId = await findWorkspaceByStripeCustomer(customerId);
  }

  if (workspaceId) {
    const enterprisePrice = process.env.STRIPE_ENTERPRISE_SEAT_PRICE_ID?.trim() ?? "";
    for (const item of subscription.items?.data ?? []) {
      if ((item.price?.id ?? "") === enterprisePrice || isEnterpriseIntent(metadata)) {
        await updateWorkspaceEnterpriseProfile(workspaceId, "free", undefined, 0);
        await saveWorkspaceBilling(workspaceId, {
          stripeSubscriptionId: "",
          stripeSubscriptionStatus: "canceled",
          seatCount: 0,
        });
        return;
      }
    }
  }

  const uid = await resolveUid({ customerId });
  if (!uid) return;

  await updateUserSubscriptionProfile(uid, "free", false);
  await saveUserBilling(uid, {
    stripeSubscriptionId: "",
    stripeOnDemandItemId: "",
    stripeSubscriptionStatus: "canceled",
  });
}

async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  const eventId = event.id;
  const eventType = event.type;

  try {
    await claimStripeWebhookEvent(eventId, eventType);
  } catch (err) {
    if (err instanceof WebhookAlreadyProcessed) {
      console.info("Skipping duplicate Stripe webhook event", eventId);
      return;
    }
    throw err;
  }

  const dataObject = event.data.object;

  try {
    switch (eventType) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(dataObject as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionEvent(dataObject as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(dataObject as Stripe.Subscription);
        break;
      default:
        break;
    }
    await markStripeWebhookProcessed(eventId);
  } catch (err) {
    await releaseStripeWebhookClaim(eventId);
    throw err;
  }
}

/** Stripe webhook endpoint — URL à coller dans le Dashboard Stripe. */
export const stripeWebhook = onRequest(
  {
    cors: false,
    invoker: "public",
    region: FUNCTIONS_REGION,
  },
  async (req, res) => {
    await ensureFunctionsSecretsLoaded();

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      res.status(503).send("Stripe webhook secret is not configured.");
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      res.status(400).send("Missing Stripe signature.");
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      res.status(400).send("Missing request body.");
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = stripeClient();
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      res.status(400).send("Invalid Stripe webhook payload.");
      return;
    }

    try {
      await dispatchStripeEvent(event);
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Stripe webhook processing failed:", err);
      res.status(500).send("Webhook handler failed.");
    }
  },
);
