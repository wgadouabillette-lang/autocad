const controllers = new Map<string, AbortController>();

export function beginAiRequest(runId: string): AbortSignal {
  const ctrl = new AbortController();
  controllers.set(runId, ctrl);
  return ctrl.signal;
}

/** Annule une requête (ou toutes si runId omis). */
export function cancelAiRequest(runId?: string): void {
  if (runId) {
    controllers.get(runId)?.abort();
    controllers.delete(runId);
    return;
  }
  for (const ctrl of controllers.values()) {
    ctrl.abort();
  }
  controllers.clear();
}

export function endAiRequest(runId: string): void {
  controllers.delete(runId);
}

export function activeAiRequestCount(): number {
  return controllers.size;
}
