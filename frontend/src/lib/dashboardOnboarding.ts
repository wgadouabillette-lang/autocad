import { closePanelsOnSide } from "./bottomPanelCoordination";
import { loadUserProfile } from "./firebase/userData";
import {
  finalizeNotifications,
  loadPersistedNotifications,
  persistNotifications,
} from "./notificationsPersistence";
import { useAuthStore } from "../store/useAuthStore";
import {
  useNotificationsStore,
  type AppNotification,
} from "../store/useNotificationsStore";

const STORAGE_PREFIX = "forma-dashboard-onboarding-seen:";

const ONBOARDING_CATEGORY = "Product overview";

const ONBOARDING_TEMPLATES: Omit<AppNotification, "id" | "createdAt" | "read">[] = [
  {
    kind: "onboarding",
    category: ONBOARDING_CATEGORY,
    title: "Connect your Calendar",
    body: "Sync Google Calendar to see your day, join meetings, and schedule from Lyte.",
  },
  {
    kind: "onboarding",
    title: "Invite your colleague",
    body: "Add teammates to your workspace so you can chat, call, and collaborate together.",
  },
  {
    kind: "onboarding",
    title: "Record your screen",
    body: "Capture your screen in one click and find recordings in your chat history.",
  },
  {
    kind: "onboarding",
    title: "Generate Follow-ups",
    body: "Turn a voice call into a structured recap with calendar actions and follow-up emails.",
  },
  {
    kind: "onboarding",
    title: "Generate meeting notes",
    body: "Use AI Notes during calls to produce clear meeting notes automatically.",
  },
];

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

export async function runDashboardOnboardingIfNeeded(
  email: string,
  uid: string | null,
): Promise<void> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return;

  if (uid) {
    const profile = await loadUserProfile(uid);
    if (profile?.dashboardOnboardingCompleted) {
      markDashboardOnboardingSeenLocally(trimmed);
      purgeOnboardingNotifications(trimmed);
      return;
    }
  }

  if (hasSeenDashboardOnboardingLocally(trimmed)) {
    await markDashboardOnboardingCompletedForAccount(uid);
    purgeOnboardingNotifications(trimmed);
    return;
  }

  const items: AppNotification[] = ONBOARDING_TEMPLATES.map((item, index) => ({
    ...item,
    id: `onboarding-${index + 1}`,
    createdAt: Date.now() - (ONBOARDING_TEMPLATES.length - index) * 1000,
    read: false,
  }));

  closePanelsOnSide("left", "notifications");
  const activeItems = finalizeNotifications(trimmed, items);
  if (activeItems.length === 0) {
    markDashboardOnboardingSeenLocally(trimmed);
    await markDashboardOnboardingCompletedForAccount(uid);
    return;
  }

  useNotificationsStore.setState({
    persistedEmail: trimmed,
    items: activeItems,
    currentIndex: 0,
    panelOpen: true,
  });

  markDashboardOnboardingSeenLocally(trimmed);
  await markDashboardOnboardingCompletedForAccount(uid);
}
