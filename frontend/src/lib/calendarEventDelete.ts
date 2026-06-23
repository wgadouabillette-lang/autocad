import { deleteUserCalendarEvent } from "./calendarEventsApi";
import { notifyCalendarEventsChanged } from "../hooks/usePersistedCalendarEvents";
import { useCalendarStore } from "../store/useCalendarStore";

/** Retire un bloc du calendrier (Firestore + Google / Outlook si lié). */
export async function deleteCalendarEventById(eventId: string): Promise<void> {
  const event = useCalendarStore.getState().findCalendarEvent(eventId);
  if (!event) return;

  await deleteUserCalendarEvent(event.id);
  useCalendarStore.getState().removeCalendarEvent(event.id);
  notifyCalendarEventsChanged();
  window.dispatchEvent(new CustomEvent("forma-connector-oauth-done"));
}
