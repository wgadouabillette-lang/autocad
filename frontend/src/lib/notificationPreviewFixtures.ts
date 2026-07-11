import type { AppNotification } from "../store/useNotificationsStore";

/** Dev-only: set true to inject fixture notifications for visual QA. */
export const NOTIFICATIONS_PREVIEW_ALL = false;

function fixture(
  id: string,
  item: Omit<AppNotification, "id" | "createdAt" | "read">,
): AppNotification {
  return {
    ...item,
    id: `preview-${id}`,
    createdAt: Date.now(),
    read: false,
  };
}

/** Notifications that already have a custom visual in the panel. */
export const NOTIFICATION_PREVIEW_FIXTURES: AppNotification[] = [
  fixture("calendar", {
    kind: "meeting",
    category: "Calendar",
    title: "Connect your Calendar",
    body: "Sync Google Calendar or Outlook to see meetings in Hall.",
  }),
  fixture("recording-saved", {
    kind: "recording",
    category: "Recordings",
    title: "Recording saved",
    body: "Available in your notes history.",
    recordingSessionId: "preview-recording",
  }),
  fixture("connector", {
    kind: "workspace",
    category: "Workspace",
    title: "Connecteur non lié",
    body: "Connexion au connecteur impossible. Vérifiez la configuration OAuth.",
  }),
  fixture("friend-request", {
    kind: "friend_request",
    category: "Team",
    title: "Demande d'ami",
    body: "Jordan veut vous ajouter en ami.",
    friendRequestId: "preview-friend-request",
  }),
  fixture("friend-request-error", {
    kind: "friend_request",
    category: "Team",
    title: "Demandes d'amis indisponibles",
    body: "Firebase refuse la demande. Déployez les règles Firestore puis réessayez.",
  }),
  fixture("friend-request-decline", {
    kind: "friend_request",
    category: "Team",
    title: "Réponse impossible",
    body: "Impossible d'accepter la demande d'ami pour le moment.",
  }),
  fixture("message-failed", {
    kind: "message",
    category: "Messages",
    title: "Message non envoyé",
    body: "Votre message n'a pas pu être envoyé. Réessayez.",
    messagePersonId: "preview-person",
    messagePersonName: "Jordan",
  }),
  fixture("schedule-failed", {
    kind: "message",
    category: "Messages",
    title: "Planning non envoyé",
    body: "Impossible d'envoyer le planning à ce contact.",
  }),
  fixture("join-declined", {
    kind: "workspace",
    category: "Workspace",
    title: "Demande refusée",
    body: "Votre demande d'adhésion a été refusée.",
  }),
];

export function isNotificationsPreviewAllEnabled(): boolean {
  return NOTIFICATIONS_PREVIEW_ALL;
}

export function previewNotificationFixtures(): AppNotification[] {
  return NOTIFICATION_PREVIEW_FIXTURES.map((item) => ({ ...item, read: false }));
}
