import type { AiModel } from "./aiModels";
import type { PresenceActivityId } from "./presenceActivity";

export type AiStrokeVariant = "claude" | "grok" | "auto";

export function aiStrokeVariantFromModel(model: AiModel): AiStrokeVariant {
  if (model === "grok") return "grok";
  if (model.startsWith("claude")) return "claude";
  return "auto";
}

export function presenceActivityFromModel(model: AiModel): PresenceActivityId {
  if (model === "grok") return "grok";
  if (model.startsWith("claude")) return "claude";
  return "auto";
}

export function aiStrokeVariantFromPresence(
  activity: PresenceActivityId,
): AiStrokeVariant | null {
  if (activity === "claude") return "claude";
  if (activity === "grok") return "grok";
  if (activity === "auto") return "auto";
  return null;
}

export function aiStrokeClasses(variant: AiStrokeVariant | null | undefined): string[] {
  if (!variant) return [];
  return ["call-block--ai-stroke", `call-block--ai-stroke--${variant}`];
}
