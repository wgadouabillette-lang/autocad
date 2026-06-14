import type { AppNotification } from "../store/useNotificationsStore";

const KEY_PREFIX = "forma-notifications:";
const SEEN_KEY_PREFIX = "forma-notifications-seen:";

function inboxKey(email: string | null): string {
  return `${KEY_PREFIX}${email?.trim().toLowerCase() || "default"}`;
}

function seenKey(email: string | null): string {
  return `${SEEN_KEY_PREFIX}${email?.trim().toLowerCase() || "default"}`;
}

export function loadSeenNotificationIds(email: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(seenKey(email));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function markNotificationSeen(email: string | null, id: string): void {
  const seen = loadSeenNotificationIds(email);
  if (seen.has(id)) return;
  seen.add(id);
  try {
    localStorage.setItem(seenKey(email), JSON.stringify([...seen]));
  } catch {
    // ignore quota / private mode
  }
}

export function markNotificationsSeen(email: string | null, ids: string[]): void {
  if (ids.length === 0) return;
  const seen = loadSeenNotificationIds(email);
  let changed = false;
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  try {
    localStorage.setItem(seenKey(email), JSON.stringify([...seen]));
  } catch {
    // ignore quota / private mode
  }
}

export function loadPersistedNotifications(email: string | null): AppNotification[] {
  try {
    const raw = localStorage.getItem(inboxKey(email));
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistNotifications(email: string | null, items: AppNotification[]): void {
  try {
    localStorage.setItem(inboxKey(email), JSON.stringify(items));
  } catch {
    // ignore quota / private mode
  }
}

/** Garde uniquement les notifications non lues et jamais vues par l'utilisateur. */
export function activeNotifications(
  email: string | null,
  items: AppNotification[],
): AppNotification[] {
  const seen = loadSeenNotificationIds(email);
  return items.filter(
    (item) => item.kind === "friend_request" || (!item.read && !seen.has(item.id)),
  );
}

export function allNotificationsSeen(items: AppNotification[]): boolean {
  return items.length > 0 && items.every((item) => item.read);
}

/** Persiste la file en excluant les notifications déjà vues. */
export function finalizeNotifications(
  email: string | null,
  items: AppNotification[],
): AppNotification[] {
  const next = activeNotifications(email, items);
  persistNotifications(email, next);
  return next;
}
