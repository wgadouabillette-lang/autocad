import type { AiModel } from "./aiModels";
import { isOpenAiChatModel } from "./aiModels";
import type { PresenceActivityId } from "./presenceActivity";

export type AiStrokeVariant = "claude" | "grok" | "auto";

export function aiStrokeVariantFromModel(model: AiModel): AiStrokeVariant {
  if (model === "grok" || model === "grok-mini") return "grok";
  if (model.startsWith("claude")) return "claude";
  return "auto";
}

export function presenceActivityFromModel(model: AiModel): PresenceActivityId {
  if (model === "auto") return "auto";
  if (model === "grok" || model === "grok-mini") return "grok";
  if (model.startsWith("claude")) return "claude";
  if (isOpenAiChatModel(model)) return "openai";
  return "auto";
}

export function aiStrokeVariantFromPresence(
  activity: PresenceActivityId,
): AiStrokeVariant | null {
  if (activity === "claude") return "claude";
  if (activity === "grok") return "grok";
  if (activity === "openai" || activity === "auto") return "auto";
  return null;
}

export function aiStrokeClasses(variant: AiStrokeVariant | null | undefined): string[] {
  if (!variant) return [];
  return ["call-block--ai-stroke", `call-block--ai-stroke--${variant}`];
}
