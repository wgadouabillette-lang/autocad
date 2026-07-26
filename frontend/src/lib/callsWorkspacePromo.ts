/** Dismiss / reappear schedule for the calls workspace Boost promo. */

const STORAGE_KEY = "forma-calls-workspace-promo-dismissed-at";

/** After dismiss, hide until this cooldown elapses (then the promo may show again). */
export const CALLS_WORKSPACE_PROMO_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function isCallsWorkspacePromoDismissed(now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt) || dismissedAt <= 0) return false;
    return now - dismissedAt < CALLS_WORKSPACE_PROMO_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function dismissCallsWorkspacePromo(now = Date.now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // ignore quota / private mode
  }
}

export function clearCallsWorkspacePromoDismissal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
