import { useCallback, useEffect, useState } from "react";
import {
  fetchOutlookCalendarEvents,
  fetchOutlookCalendarStatus,
  type OutlookCalendarStatus,
} from "../lib/outlookCalendarSync";
import { useCalendarStore } from "../store/useCalendarStore";
import { useAuthStore } from "../store/useAuthStore";

export function useOutlookCalendarSync(selectedDate: string) {
  const authReady = useAuthStore((s) => s.ready);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setOutlookEvents = useCalendarStore((s) => s.setOutlookEvents);
  const [status, setStatus] = useState<OutlookCalendarStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authReady || !isAuthenticated) return;
    setLoading(true);
    try {
      const nextStatus = await fetchOutlookCalendarStatus();
      setStatus(nextStatus);
      setError(null);
      if (!nextStatus.connected) {
        setOutlookEvents([], selectedDate);
        return;
      }
      const events = await fetchOutlookCalendarEvents(selectedDate);
      setOutlookEvents(events, selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync Outlook indisponible.");
    } finally {
      setLoading(false);
    }
  }, [authReady, isAuthenticated, selectedDate, setOutlookEvents]);

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
