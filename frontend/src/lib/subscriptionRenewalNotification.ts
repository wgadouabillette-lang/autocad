import type { SubscriptionPlan } from "./subscriptionPlans";

/** Notification 24 h avant le prélèvement de renouvellement d'abonnement. */
export function pushSubscriptionRenewalNotification(_plan: SubscriptionPlan = "pro"): void {
  // Billing renewal notifications are intentionally disabled.
}
