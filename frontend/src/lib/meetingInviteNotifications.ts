import { formatDayLabel } from "./daySchedule";
import { loadSeenNotificationIds } from "./notificationsPersistence";
import { useNotificationsStore } from "../store/useNotificationsStore";

export function meetingInviteNotificationId(messageId: string): string {
  return `meeting-invite-${messageId}`;
}

export function meetingInviteMetaNotificationId(
  chatId: string,
  updatedAt: number,
  preview: string,
): string {
  return `meeting-invite-meta-${chatId}-${updatedAt}-${preview.slice(0, 80)}`;
}

function hasMeetingInviteNotification(notificationId: string): boolean {
  const email = useNotificationsStore.getState().persistedEmail;
  if (loadSeenNotificationIds(email).has(notificationId)) return true;
  return useNotificationsStore
    .getState()
    .items.some((item) => item.kind === "meeting" && item.id === notificationId);
}

function meetingInviteBody(
  title: string,
  dateKey: string,
  startTime: string,
  endTime: string,
): string {
  const dayLabel = dateKey ? formatDayLabel(dateKey) : "";
  const timeLabel = startTime && endTime ? `${startTime} – ${endTime}` : "";
  const parts = [`« ${title} »`];
  if (dayLabel) parts.push(dayLabel);
  if (timeLabel) parts.push(timeLabel);
  return parts.join(" · ");
}

/** In-app notification for a meeting invite received via friend chat. */
export function notifyInviteeOfMeetingInvite(input: {
  messageId?: string;
  metaId?: string;
  organizerName: string;
  title: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  threadId: string;
  personId: string;
}): void {
  const notificationId =
    input.messageId != null
      ? meetingInviteNotificationId(input.messageId)
      : input.metaId ?? meetingInviteMetaNotificationId(input.threadId, Date.now(), input.title);

  if (hasMeetingInviteNotification(notificationId)) return;

  useNotificationsStore.getState().push({
    id: notificationId,
    kind: "meeting",
    category: "Calendar",
    title: `${input.organizerName} vous invite à une réunion`,
    body: meetingInviteBody(input.title, input.dateKey, input.startTime, input.endTime),
    messageThreadId: input.threadId,
    messagePersonId: input.personId,
    messagePersonName: input.organizerName,
  });
}
