/** Intervalle rapide pendant un appel / canal vocal ouvert (réactivité voice UI). */
export const PRESENCE_HEARTBEAT_IN_CALL_MS = 15_000;

/** Intervalle au repos — onglet visible, pas en appel. */
export const PRESENCE_HEARTBEAT_IDLE_MS = 60_000;

export interface PresenceHeartbeatController {
  /** Envoie immédiatement si l'onglet est visible. */
  pulse: () => void;
  /** Reprend ou ajuste le timer (ex. changement d'état vocal). */
  reschedule: () => void;
  stop: () => void;
}

/**
 * Planificateur de heartbeat présence — isolé du reste de l'app.
 * - Aucun write si l'onglet est caché (background)
 * - 15 s en appel vocal, 60 s au repos
 */
export function createPresenceHeartbeat(options: {
  isHighFrequency: () => boolean;
  onPulse: () => void;
}): PresenceHeartbeatController {
  let timer: number | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    window.clearTimeout(timer);
    timer = null;
  };

  const intervalMs = () =>
    options.isHighFrequency()
      ? PRESENCE_HEARTBEAT_IN_CALL_MS
      : PRESENCE_HEARTBEAT_IDLE_MS;

  const scheduleNext = () => {
    clearTimer();
    if (document.hidden) return;
    timer = window.setTimeout(() => {
      options.onPulse();
      scheduleNext();
    }, intervalMs());
  };

  const pulse = () => {
    if (document.hidden) return;
    options.onPulse();
  };

  const reschedule = () => {
    if (document.hidden) {
      clearTimer();
      return;
    }
    scheduleNext();
  };

  const stop = () => {
    clearTimer();
  };

  return { pulse, reschedule, stop };
}
