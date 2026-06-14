export type StepStatus = "pending" | "active" | "done" | "error";

export interface AiRunStep {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
}

/** Sous-ensemble pour le libellé actif sans dépendance circulaire. */
interface RunLike {
  status: string;
  steps: AiRunStep[];
  summary: string;
}

export type RunKind = "modelling" | "agent" | "generate" | "chat";

function step(id: string, label: string, status: AiRunStep["status"] = "pending"): AiRunStep {
  return { id, label, status };
}

/** Étapes affichées pendant l'exécution (ordre chronologique). */
export function buildRunSteps(kind: RunKind): AiRunStep[] {
  if (kind === "chat") {
    return [step("1", "Processing…", "active")];
  }
  return [
    step("1", "Analyzing…", "active"),
    step("2", "Processing…"),
  ];
}

export function runKindFromPrompt(
  _prompt: string,
  hasImages: boolean,
  workMode: "agent" | "render" | "multitask" = "agent",
): RunKind {
  if (workMode === "render" && hasImages) return "modelling";
  return "agent";
}

/** Libellé de l'étape en cours (remplace « Traitement… »). */
export function activeStepLabel(run: RunLike): string {
  const active = run.steps.find((s) => s.status === "active");
  if (active) return active.label;
  const pending = run.steps.find((s) => s.status === "pending");
  if (run.status === "running" && pending) return pending.label;
  if (run.status === "running") return "Processing…";
  return run.summary;
}

export function advanceRunSteps(steps: AiRunStep[]): AiRunStep[] {
  const next = steps.map((s) => ({ ...s }));
  const activeIdx = next.findIndex((s) => s.status === "active");
  if (activeIdx >= 0) {
    next[activeIdx].status = "done";
    if (activeIdx + 1 < next.length) {
      next[activeIdx + 1].status = "active";
    }
  } else {
    const pendingIdx = next.findIndex((s) => s.status === "pending");
    if (pendingIdx >= 0) next[pendingIdx].status = "active";
  }
  return next;
}

export function setStepStatus(
  steps: AiRunStep[],
  stepId: string,
  status: AiRunStep["status"],
  label?: string,
): AiRunStep[] {
  return steps.map((s) =>
    s.id === stepId ? { ...s, status, ...(label ? { label } : {}) } : s,
  );
}

/** Intervalle entre deux étapes simulées pendant l'attente API. */
export function stepTickIntervalMs(kind: RunKind): number {
  void kind;
  return 8_000;
}
