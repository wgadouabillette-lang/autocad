const DEBUG_SESSION_ID = "e1618b";
const DEBUG_INGEST_ENDPOINT =
  "http://127.0.0.1:7941/ingest/bf77dbb7-04a4-446f-817c-db0d19c43744";

/** No-op unless VITE_FORMA_AGENT_DEBUG=1 — évite les fetch locaux en hot path. */
const AGENT_DEBUG_ENABLED = import.meta.env.VITE_FORMA_AGENT_DEBUG === "1";

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix",
): void {
  if (!AGENT_DEBUG_ENABLED) return;
  // #region agent log
  fetch(DEBUG_INGEST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": DEBUG_SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId,
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
