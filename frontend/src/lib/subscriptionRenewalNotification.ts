import { planLabel, type SubscriptionPlan } from "./subscriptionPlans";
import { useNotificationsStore } from "../store/useNotificationsStore";

/** Notification 24 h avant le prélèvement de renouvellement d'abonnement. */
export function pushSubscriptionRenewalNotification(plan: SubscriptionPlan = "pro"): void {
  useNotificationsStore.getState().push({
    kind: "renewal",
    category: "Renewal",
    title: "Subscription renews tomorrow",
    body: `Your card will be charged in 24 hours to renew your ${planLabel(plan)} plan. Update your payment method in Billing if needed.`,
  });
}
