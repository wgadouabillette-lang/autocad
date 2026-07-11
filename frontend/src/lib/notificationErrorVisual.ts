import type { AppNotification } from "../store/useNotificationsStore";

export type ErrorNotificationVisualVariant = "message" | "friend" | "connector" | "workspace";

const ERROR_TITLES = new Set([
  "Demandes d'amis indisponibles",
  "Réponse impossible",
  "Message non envoyé",
  "Planning non envoyé",
  "Connecteur non lié",
  "Demande refusée",
]);

export function isErrorNotification(item: AppNotification): boolean {
  return ERROR_TITLES.has(item.title);
}

export function errorNotificationVisualVariant(
  item: AppNotification,
): ErrorNotificationVisualVariant {
  switch (item.title) {
    case "Connecteur non lié":
      return "connector";
    case "Demande refusée":
      return "workspace";
    case "Demandes d'amis indisponibles":
    case "Réponse impossible":
      return "friend";
    default:
      return "message";
  }
}
