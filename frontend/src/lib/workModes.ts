import type { LucideIcon } from "lucide-react";
import { Bot, Layers, ScanLine } from "lucide-react";
import { isDetailedPartDescription, isRenderTask } from "./renderMode";

export type WorkMode = "agent" | "render" | "multitask";

/** Mode choisi par l'utilisateur dans le composeur (hors Multitask automatique). */
export type SelectableWorkMode = "agent" | "render";

export interface WorkModeDef {
  id: WorkMode;
  label: string;
  placeholder: string;
  icon: LucideIcon;
  iconClass: string;
  capsule: string;
  send: string;
  sendHover: string;
  sendIcon: string;
}

const AGENT: WorkModeDef = {
  id: "agent",
  label: "Agent",
  placeholder: "Ask for a change to the part…",
  icon: Bot,
  iconClass: "text-muted-300",
  capsule: "border-ink-600 bg-ink-750 text-muted-200",
  send: "border border-ink-600 bg-ink-750",
  sendHover: "hover:bg-ink-700",
  sendIcon: "text-muted-200",
};

const RENDER: WorkModeDef = {
  id: "render",
  label: "Render",
  placeholder: "Attach a drawing with all dimensions visible (views, Ø, M, depths)…",
  icon: ScanLine,
  iconClass: "text-amber-300",
  capsule: "work-mode-capsule work-mode-capsule--render border-amber-500/50 bg-amber-500/14 text-amber-100",
  send: "work-mode-send work-mode-send--render border border-amber-500/50 bg-amber-500/14",
  sendHover: "hover:bg-amber-500/22",
  sendIcon: "text-current",
};

/** Affiché automatiquement quand 2+ requêtes IA tournent en parallèle. */
const MULTITASK: WorkModeDef = {
  id: "multitask",
  label: "Multitask",
  placeholder: "Multiple requests in progress…",
  icon: Layers,
  iconClass: "text-muted-300",
  capsule: "border-ink-500/55 bg-ink-750/80 text-muted-200",
  send: "border border-ink-500/55 bg-ink-750/80",
  sendHover: "hover:bg-ink-700",
  sendIcon: "text-muted-200",
};

const BY_ID: Record<WorkMode, WorkModeDef> = {
  agent: AGENT,
  render: RENDER,
  multitask: MULTITASK,
};

export const SELECTABLE_WORK_MODES: SelectableWorkMode[] = ["agent", "render"];

export type SubmitWorkModeResult =
  | {
      action: "send";
      mode: WorkMode;
      switchedFromRender?: boolean;
      switchedToRender?: boolean;
    }
  | { action: "blocked"; message: string; requireImage?: boolean };

/** Mode effectif selon le nombre de requêtes IA actives et le choix utilisateur. */
export function effectiveWorkMode(
  activeAiRequests: number,
  selected: SelectableWorkMode = "agent",
): WorkMode {
  return activeAiRequests > 1 ? "multitask" : selected;
}

export function workModeDef(id: WorkMode): WorkModeDef {
  return BY_ID[id] ?? AGENT;
}

export function workModeDefForSelection(
  activeAiRequests: number,
  selected: SelectableWorkMode,
): WorkModeDef {
  return workModeDef(effectiveWorkMode(activeAiRequests, selected));
}

/** @deprecated Préférer workModeDefForSelection avec chatWorkMode. */
export function workModeDefForActiveCount(activeAiRequests: number): WorkModeDef {
  return workModeDefForSelection(activeAiRequests, "agent");
}

export function resolveSubmitWorkMode(
  chatWorkMode: SelectableWorkMode,
  autoWorkModeSwitch: boolean,
  activeAiRequests: number,
  prompt: string,
  hasImages: boolean,
): SubmitWorkModeResult {
  const multitask = activeAiRequests > 1;
  if (multitask) return { action: "send", mode: "multitask" };

  const renderTask = isRenderTask(prompt, hasImages);
  const textSpec = isDetailedPartDescription(prompt);

  if (chatWorkMode === "agent") {
    if (renderTask) {
      if (autoWorkModeSwitch) {
        return { action: "send", mode: "render", switchedToRender: true };
      }
      return {
        action: "blocked",
        message:
          "This request is about modeling a part (drawing, image, or detailed description). " +
          "Switch to Render mode (or enable automatic mode selection in settings).",
        requireImage: !hasImages && !textSpec,
      };
    }
    return { action: "send", mode: "agent" };
  }

  if (!renderTask) {
    if (autoWorkModeSwitch) {
      return { action: "send", mode: "agent", switchedFromRender: true };
    }
    return {
      action: "blocked",
        message:
        "Render mode is only for modeling a part from a drawing, image, " +
        "or detailed description. For this request, switch to Agent mode " +
        "(or enable automatic mode selection in settings).",
    };
  }

  if (!hasImages && !textSpec) {
    return {
      action: "blocked",
        message:
        "Render mode requires a drawing image or a detailed text description " +
        "(dimensions, holes, etc.) — add an image with the + button or describe the part.",
      requireImage: true,
    };
  }

  return { action: "send", mode: "render" };
}
