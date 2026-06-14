export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  fetch("http://127.0.0.1:7941/ingest/bf77dbb7-04a4-446f-817c-db0d19c43744", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "2a4736",
    },
    body: JSON.stringify({
      sessionId: "2a4736",
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
