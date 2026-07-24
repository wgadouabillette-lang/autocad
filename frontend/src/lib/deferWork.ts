/** Reporte du travail non critique après le premier paint / idle du navigateur. */
export function deferAfterIdle(work: () => void, timeoutMs = 4000): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) work();
  };

  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const timer = window.setTimeout(run, Math.min(timeoutMs, 2000));
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}

/** Court délai après montage — laisse respirer l'UI avant les prefetch lourds. */
export function deferAfterFirstPaint(work: () => void, delayMs = 1800): () => void {
  let cancelled = false;
  const timer = window.setTimeout(() => {
    if (!cancelled) work();
  }, delayMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
