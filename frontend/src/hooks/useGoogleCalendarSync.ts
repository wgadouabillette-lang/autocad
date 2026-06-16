import { useCallback, useEffect, useState } from "react";
import {
  fetchGoogleCalendarEvents,
  fetchGoogleCalendarStatus,
  type GoogleCalendarStatus,
} from "../lib/calendarSync";
import { useCalendarStore } from "../store/useCalendarStore";
import { useAuthStore } from "../store/useAuthStore";

export function useGoogleCalendarSync(selectedDate: string) {
  const authReady = useAuthStore((s) => s.ready);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setGoogleEvents = useCalendarStore((s) => s.setGoogleEvents);
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authReady || !isAuthenticated) return;
    setLoading(true);
    try {
      const nextStatus = await fetchGoogleCalendarStatus();
      setStatus(nextStatus);
      setError(null);
      if (!nextStatus.connected) {
        setGoogleEvents([], selectedDate);
        return;
      }
      const events = await fetchGoogleCalendarEvents(selectedDate);
      setGoogleEvents(events, selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync Google Calendar indisponible.");
    } finally {
      setLoading(false);
    }
  }, [authReady, isAuthenticated, selectedDate, setGoogleEvents]);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    void refresh();
  }, [authReady, isAuthenticated, refresh]);

  useEffect(() => {
    const onOAuthDone = () => void refresh();
    window.addEventListener("forma-connector-oauth-done", onOAuthDone);
    window.addEventListener("forma-connector-disconnect-done", onOAuthDone);
    return () => {
      window.removeEventListener("forma-connector-oauth-done", onOAuthDone);
      window.removeEventListener("forma-connector-disconnect-done", onOAuthDone);
    };
  }, [refresh]);

  return {
    status,
    loading,
    error,
    refresh,
  };
}
