import { useCallback, useEffect, useState } from "react";
import { syncUserEventsToOutlook } from "../lib/calendarEventsApi";
import {
  fetchOutlookCalendarEventsForDate,
  fetchOutlookCalendarStatus,
  type OutlookCalendarStatus,
} from "../lib/outlookCalendarSync";
import { useCalendarStore } from "../store/useCalendarStore";
import { isMarketingPreview } from "../lib/marketingPreview";
import { useAuthStore } from "../store/useAuthStore";

export function useOutlookCalendarSync(selectedDate: string) {
  const authReady = useAuthStore((s) => s.ready);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setOutlookEvents = useCalendarStore((s) => s.setOutlookEvents);
  const setUserEvents = useCalendarStore((s) => s.setUserEvents);
  const [status, setStatus] = useState<OutlookCalendarStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const refresh = useCallback(async () => {
    if (isMarketingPreview()) return;
    if (!authReady || !isAuthenticated) return;
    setLoading(true);
    try {
      const nextStatus = await fetchOutlookCalendarStatus();
      setStatus(nextStatus);
      setError(null);
      setNeedsReconnect(Boolean(nextStatus.authExpired));
      if (!nextStatus.connected) {
        setOutlookEvents([], selectedDate);
        return;
      }
      try {
        const retro = await syncUserEventsToOutlook();
        if (retro.events.length > 0) {
          setUserEvents(retro.events);
        }
      } catch {
        /* push local events when Outlook is connected */
      }
      const { events, authExpired } = await fetchOutlookCalendarEventsForDate(selectedDate);
      setOutlookEvents(events, selectedDate);
      if (authExpired) {
        setNeedsReconnect(true);
        setError("Session Outlook expirée. Reconnectez le connecteur Outlook.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync Outlook indisponible.");
    } finally {
      setLoading(false);
    }
  }, [authReady, isAuthenticated, selectedDate, setOutlookEvents, setUserEvents]);

  useEffect(() => {
    if (isMarketingPreview()) return;
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
    needsReconnect,
    refresh,
  };
}
