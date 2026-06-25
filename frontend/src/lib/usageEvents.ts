export const AI_USAGE_UPDATED_EVENT = "forma-ai-usage-updated";

export function notifyAiUsageUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_USAGE_UPDATED_EVENT));
}
