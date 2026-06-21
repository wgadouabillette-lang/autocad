import {
  loadPersistedNotifications,
  persistNotifications,
} from "./notificationsPersistence";
import { useAuthStore } from "../store/useAuthStore";
import { useNotificationsStore } from "../store/useNotificationsStore";

const STORAGE_PREFIX = "forma-dashboard-onboarding-seen:";

function storageKey(email: string): string {
  return `${STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

function hasSeenDashboardOnboardingLocally(email: string): boolean {
  try {
    return localStorage.getItem(storageKey(email)) === "1";
  } catch {
    return false;
  }
}

function markDashboardOnboardingSeenLocally(email: string): void {
  try {
    localStorage.setItem(storageKey(email), "1");
  } catch {
    // ignore quota / private mode
  }
}

export function hasSeenDashboardOnboarding(email: string): boolean {
  return hasSeenDashboardOnboardingLocally(email);
}

function purgeOnboardingNotifications(email: string): void {
  const normalized = email.trim().toLowerCase();
  const items = loadPersistedNotifications(normalized).filter((item) => item.kind !== "onboarding");
  persistNotifications(normalized, items);

  const store = useNotificationsStore.getState();
  if (store.persistedEmail?.trim().toLowerCase() === normalized) {
    const nextItems = store.items.filter((item) => item.kind !== "onboarding");
    useNotificationsStore.setState({
      items: nextItems,
      currentIndex:
        nextItems.length === 0 ? 0 : Math.min(store.currentIndex, nextItems.length - 1),
      panelOpen: nextItems.length > 0 ? store.panelOpen : false,
    });
  }
}

async function markDashboardOnboardingCompletedForAccount(uid: string | null): Promise<void> {
  if (!uid) return;
  await useAuthStore.getState().markDashboardOnboardingCompleted();
}

export function applyDashboardOnboardingFromProfile(
  email: string,
  completed: boolean | undefined,
): void {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !completed) return;
  markDashboardOnboardingSeenLocally(trimmed);
  purgeOnboardingNotifications(trimmed);
}

/** Marks onboarding complete and clears any legacy onboarding cards — no cards are shown. */
export async function runDashboardOnboardingIfNeeded(
  email: string,
  uid: string | null,
): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return;

  markDashboardOnboardingSeenLocally(trimmed);
  purgeOnboardingNotifications(trimmed);
  await markDashboardOnboardingCompletedForAccount(uid);
}
