import { api } from "./api";
import { useStore } from "../store/useStore";

export type AppBootStatus = "loading" | "ready" | "connection_error";

/** Health en arrière-plan — ne bloque jamais l'UI. */
function refreshHealthInBackground(): void {
  void api
    .health()
    .then((health) => {
      useStore.setState({ llmEnabled: !!health.llm });
    })
    .catch(() => {
      useStore.setState({ llmEnabled: false });
    });
}

export async function runAppBoot(): Promise<Exclude<AppBootStatus, "loading">> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "connection_error";
  }

  refreshHealthInBackground();
  return "ready";
}
