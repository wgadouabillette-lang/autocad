import { useEffect } from "react";
import { checkMeetingReminders } from "../lib/meetingReminders";
import { useAuthStore } from "../store/useAuthStore";
import { useCalendarStore } from "../store/useCalendarStore";

const CHECK_INTERVAL_MS = 30_000;

export function useMeetingReminders() {
  const authEmail = useAuthStore((s) => s.authEmail);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authReady = useAuthStore((s) => s.ready);
  const userEvents = useCalendarStore((s) => s.userEvents);
  const googleEvents = useCalendarStore((s) => s.googleEvents);
  const outlookEvents = useCalendarStore((s) => s.outlookEvents);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const run = () => {
      const events = [
        ...useCalendarStore.getState().userEvents,
        ...useCalendarStore.getState().googleEvents,
        ...useCalendarStore.getState().outlookEvents,
      ];
      checkMeetingReminders(authEmail, events);
    };

    run();
    const id = window.setInterval(run, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [authReady, isAuthenticated, authEmail, userEvents, googleEvents, outlookEvents]);
}
