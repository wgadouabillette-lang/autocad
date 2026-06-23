import { useCallback, useEffect } from "react";
import { refreshPersistedCalendarEvents } from "../lib/calendarEventsApi";
import { useAuthStore } from "../store/useAuthStore";
import { useCalendarStore } from "../store/useCalendarStore";

const REFRESH_MS = 60_000;

/** Charge les blocs Firestore, purge les événements passés côté serveur, rafraîchit le store. */
export function usePersistedCalendarEvents() {
  const authReady = useAuthStore((s) => s.ready);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUserEvents = useCalendarStore((s) => s.setUserEvents);

  const refresh = useCallback(async () => {
    if (!authReady || !isAuthenticated) {
      setUserEvents([]);
      return;
    }
    try {
      const events = await refreshPersistedCalendarEvents();
      setUserEvents(events);
    } catch {
      /* backend indisponible — conserver l'état local */
    }
  }, [authReady, isAuthenticated, setUserEvents]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [authReady, isAuthenticated, refresh]);

  useEffect(() => {
    const onRefresh = () => void refresh();
    window.addEventListener("forma-calendar-events-changed", onRefresh);
    window.addEventListener("forma-connector-oauth-done", onRefresh);
    return () => {
      window.removeEventListener("forma-calendar-events-changed", onRefresh);
      window.removeEventListener("forma-connector-oauth-done", onRefresh);
    };
  }, [refresh]);
}

export function notifyCalendarEventsChanged(): void {
  window.dispatchEvent(new CustomEvent("forma-calendar-events-changed"));
}
