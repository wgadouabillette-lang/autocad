import { closePanelsOnSide } from "./bottomPanelCoordination";
import { finalizeNotifications } from "./notificationsPersistence";
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

export function hasSeenDashboardOnboarding(email: string): boolean {
  try {
    return localStorage.getItem(storageKey(email)) === "1";
  } catch {
    return false;
  }
}

function markDashboardOnboardingSeen(email: string): void {
  try {
    localStorage.setItem(storageKey(email), "1");
  } catch {
    // ignore quota / private mode
  }
}

export function runDashboardOnboardingIfNeeded(email: string): void {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || hasSeenDashboardOnboarding(trimmed)) return;

  const items: AppNotification[] = ONBOARDING_TEMPLATES.map((item, index) => ({
    ...item,
    id: `onboarding-${index + 1}`,
    createdAt: Date.now() - (ONBOARDING_TEMPLATES.length - index) * 1000,
    read: false,
  }));

  closePanelsOnSide("left", "notifications");
  const activeItems = finalizeNotifications(trimmed, items);
  if (activeItems.length === 0) return;
  useNotificationsStore.setState({
    persistedEmail: trimmed,
    items: activeItems,
    currentIndex: 0,
    panelOpen: true,
  });
  markDashboardOnboardingSeen(trimmed);
}
