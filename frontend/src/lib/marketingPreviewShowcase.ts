import type { MarketingPreviewNavAction } from "./marketingPreview";

const SHOWCASE_ACTIONS = new Set<MarketingPreviewNavAction>([
  "show-dashboard",
  "show-polls",
  "show-recording",
  "show-follow-up",
  "show-spotify",
  "show-calendar",
  "show-notes",
  "show-messages",
]);

export function isMarketingPreviewShowcaseAction(
  action: MarketingPreviewNavAction,
): boolean {
  return SHOWCASE_ACTIONS.has(action);
}

/** Landing feature capsules are visual-only — no cursor or chip demos. */
export function applyMarketingPreviewShowcase(_action: MarketingPreviewNavAction): void {}
