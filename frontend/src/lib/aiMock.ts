/**
 * Si true : le panel IA tourne indéfiniment sans appeler le backend (debug UI seulement).
 */
export const AI_STUB_INFINITE_LOADING = false;

export function waitUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort);
  });
}
