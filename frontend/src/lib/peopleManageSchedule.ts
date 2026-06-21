import type { ManageScheduleEventDraft } from "./manageScheduleSkill";
import type { PeopleMessage } from "./peopleChat";
import type { CalendarEvent } from "../store/useCalendarStore";
import { useCalendarStore } from "../store/useCalendarStore";

export interface PeopleManageScheduleEventPayload {
  title: string;
  detail?: string;
  dateKey: string;
  startMinutes: number;
  endMinutes: number;
}

export function serializePeopleManageEvents(
  events: ManageScheduleEventDraft[],
): PeopleManageScheduleEventPayload[] {
  return events.map((event) => ({
    title: event.title,
    detail: event.detail,
    dateKey: event.dateKey,
    startMinutes: event.startMinutes,
    endMinutes: event.endMinutes,
  }));
}

export function peopleManageMessagePreview(message: PeopleMessage): string {
  if (message.kind === "manage") {
    return message.manageDisplayText?.trim() || message.text;
  }
  return message.text;
}

const appliedManageMessageIds = new Set<string>();

/** Applique automatiquement les blocs /manage reçus d'un autre participant (pas les vôtres). */
export function applyPeopleManageEventsFromMessage(message: PeopleMessage): void {
  if (message.kind !== "manage" || message.mine) return;
  if (!message.manageEvents?.length) return;
  if (appliedManageMessageIds.has(message.id)) return;

  const existingIds = new Set(useCalendarStore.getState().userEvents.map((event) => event.id));
  const payload: CalendarEvent[] = message.manageEvents
    .map((event, index) => ({
      id: `people-manage-${message.id}-${index}`,
      dateKey: event.dateKey,
      startMinutes: event.startMinutes,
      endMinutes: event.endMinutes,
      title: event.title,
      detail: event.detail,
      source: "manage-skill" as const,
    }))
    .filter((event) => !existingIds.has(event.id));

  if (payload.length === 0) {
    appliedManageMessageIds.add(message.id);
    return;
  }

  appliedManageMessageIds.add(message.id);

  useCalendarStore.getState().addEvents(payload);
}

export function syncPeopleManageEventsFromMessages(messages: PeopleMessage[]): void {
  for (const message of messages) {
    applyPeopleManageEventsFromMessage(message);
  }
}
