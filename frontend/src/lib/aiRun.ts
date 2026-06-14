import type { AiModel } from "./aiModels";
import type { WorkMode } from "./workModes";
import {
  activeStepLabel,
  advanceRunSteps,
  buildRunSteps,
  runKindFromPrompt,
  type AiRunStep,
  type RunKind,
} from "./aiRunSteps";

export type { AiRunStep, RunKind } from "./aiRunSteps";
export { activeStepLabel, advanceRunSteps } from "./aiRunSteps";

export type AiRunStatus = "running" | "done" | "error" | "cancelled";
export type AiRunExpand = "peek" | "full";

export interface AiRun {
  id: string;
  /** Texte affiché (chat / UI) — sans consignes techniques faces. */
  prompt: string;
  workMode: WorkMode;
  aiModel: AiModel;
  status: AiRunStatus;
  expand: AiRunExpand;
  startedAt: number;
  finishedAt?: number;
  steps: AiRunStep[];
  summary: string;
  message?: string;
  actions?: { kind: string; description: string }[];
  source?: string;
  error?: string;
  runKind?: RunKind;
}

export function createRunningRun(
  prompt: string,
  workMode: WorkMode,
  aiModel: AiModel,
  hasImages = false,
  runKindOverride?: RunKind,
): AiRun {
  const runKind = runKindOverride ?? runKindFromPrompt(prompt, hasImages, workMode);
  const steps = buildRunSteps(runKind);
  const run: AiRun = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt,
    workMode,
    aiModel,
    status: "running",
    expand: "peek",
    startedAt: Date.now(),
    steps,
    runKind,
    summary: "",
  };
  return { ...run, summary: activeStepLabel(run) };
}

export function summarizeActions(
  actions: { description: string }[],
  message?: string,
): string {
  if (actions.length === 0) {
    const m = message?.trim();
    if (m) return m.length > 140 ? `${m.slice(0, 137)}…` : m;
    return "No changes applied";
  }
  if (actions.length === 1) return actions[0].description;
  return `${actions.length} changes · ${actions[0].description}`;
}
