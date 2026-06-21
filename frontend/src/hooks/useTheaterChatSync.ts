import { useEffect } from "react";
import {
  watchTheaterChatMessages,
  type CloudTheaterChatMessage,
} from "../lib/firebase/theaterChat";
import { useAuthStore } from "../store/useAuthStore";
import { useTheaterChatStore, type TheaterChatMessage } from "../store/useTheaterChatStore";

function mapCloudMessage(
  message: CloudTheaterChatMessage,
  localUid: string | null,
): TheaterChatMessage {
  return {
    id: message.id,
    authorId: message.authorUid,
    author: message.authorName,
    authorPhotoURL: message.authorPhotoURL ?? null,
    kind: message.kind,
    text: message.text ?? "",
    at: message.clientCreatedAt,
    mine: !!localUid && message.authorUid === localUid,
  };
}

export function useTheaterChatSync(workspaceId: string, enabled: boolean) {
  const firebaseUid = useAuthStore((s) => s.firebaseUid);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !firebaseUid || !workspaceId) return;

    const replaceSyncedMessages = useTheaterChatStore.getState().replaceSyncedMessages;

    return watchTheaterChatMessages(
      workspaceId,
      (cloudMessages) => {
        const mapped = cloudMessages.map((message) => mapCloudMessage(message, firebaseUid));
        replaceSyncedMessages(workspaceId, mapped);
      },
      (error) => {
        console.error(`Theater chat ${workspaceId} unavailable`, error);
      },
    );
  }, [enabled, firebaseUid, isAuthenticated, workspaceId]);
}
