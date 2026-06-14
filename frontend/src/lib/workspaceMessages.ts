/** @deprecated Utiliser usePeopleStore pour les messages. */
export { type PeopleMessage as WorkspaceMessage } from "./peopleChat";

import { usePeopleStore } from "../store/usePeopleStore";

export function workspaceUnreadCount(workspaceId: string): number {
  return usePeopleStore.getState().unreadCount(workspaceId);
}
