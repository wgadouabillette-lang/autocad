import { api } from "./api";
import { useStore } from "../store/useStore";

export type AppBootStatus = "loading" | "ready" | "connection_error";

const BOOT_HEALTH_TIMEOUT_MS = 6_000;

export async function runAppBoot(): Promise<Exclude<AppBootStatus, "loading">> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "connection_error";
  }

  try {
    const health = await Promise.race([
      api.health(),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("health timeout")), BOOT_HEALTH_TIMEOUT_MS);
      }),
    ]);
    useStore.setState({ llmEnabled: !!health.llm });
    return "ready";
  } catch {
    // Laisser accéder au dashboard même si le backend est lent ou indisponible.
    useStore.setState({ llmEnabled: false });
    return "ready";
  }
}
