import type { VoicePoll } from "./voicePoll";
import { shouldShowPollToUser } from "./voicePoll";
import { loadSeenNotificationIds } from "./notificationsPersistence";
import { useAuthStore } from "../store/useAuthStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { useVoicePollStore } from "../store/useVoicePollStore";

function pollBody(poll: VoicePoll): string {
  return poll.subtitle ? `${poll.question} — ${poll.subtitle}` : poll.question;
}

export function pollMemberNotificationId(pollId: string): string {
  return `poll-member-${pollId}`;
}

export function pollCreatorNotificationId(pollId: string): string {
  return `poll-creator-${pollId}`;
}

function hasPollNotification(pollNotificationId: string): boolean {
  const email = useNotificationsStore.getState().persistedEmail;
  if (loadSeenNotificationIds(email).has(pollNotificationId)) return true;
  return useNotificationsStore
    .getState()
    .items.some((item) => item.kind === "poll" && item.id === pollNotificationId);
}

/** Confirmation locale pour l'auteur du sondage. */
export function notifyWorkspaceOfPoll(poll: VoicePoll): void {
  const push = useNotificationsStore.getState().push;
  const ingestPoll = useVoicePollStore.getState().ingestPoll;
  const notificationId = pollCreatorNotificationId(poll.id);

  ingestPoll(poll);

  if (hasPollNotification(notificationId)) return;

  push({
    id: notificationId,
    kind: "poll",
    category: "Sondage",
    title: "Sondage publié au groupe",
    pollWorkspaceId: poll.workspaceId,
    pollSnapshot: poll,
    body: pollBody(poll),
  });
}

/** Notification pour chaque membre du workspace qui reçoit le sondage via Firebase. */
export function notifyMemberOfIncomingPoll(poll: VoicePoll): void {
  const firebaseUid = useAuthStore.getState().firebaseUid;
  if (!firebaseUid || poll.createdByUserId === firebaseUid) return;
  if (poll.status !== "open") return;
  if (!shouldShowPollToUser(poll, firebaseUid)) return;

  const notificationId = pollMemberNotificationId(poll.id);
  if (hasPollNotification(notificationId)) return;

  useNotificationsStore.getState().push({
    id: notificationId,
    kind: "poll",
    category: "Sondage",
    title: `${poll.createdByName} a lancé un sondage`,
    pollWorkspaceId: poll.workspaceId,
    pollSnapshot: poll,
    body: pollBody(poll),
  });
}

export function dismissPollMemberNotification(pollId: string): void {
  const notificationId = pollMemberNotificationId(pollId);
  const items = useNotificationsStore.getState().items;
  if (!items.some((item) => item.id === notificationId)) return;
  useNotificationsStore.getState().removeNotification(notificationId);
}
