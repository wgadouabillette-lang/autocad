export const CHAT_MIN_PROCESSING_MS = 320;

export function waitMinChatProcessing(
  startedAt: number,
  signal?: AbortSignal,
): Promise<void> {
  const remaining = CHAT_MIN_PROCESSING_MS - (Date.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => resolve(), remaining);
    if (!signal) return;

    if (signal.aborted) {
      window.clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
