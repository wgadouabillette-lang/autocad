import {
  aiStrokeVariantFromModel,
  aiStrokeVariantFromPresence,
  type AiStrokeVariant,
} from "../lib/aiModelStroke";
import { LOCAL_USER_ID } from "../lib/workspaces";
import { mockPresenceActivityForUser, presenceActivityKey } from "../lib/presenceActivity";
import { useAiComposerStore } from "../store/useAiComposerStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useStore } from "../store/useStore";

/** Contour IA sur le bloc local (saisie, chargement, réponse). */
export function useLocalAiStroke(): AiStrokeVariant | null {
  const activeRoomId = useStore((s) => s.activeRoomId);
  const engaged = useAiComposerStore((s) => s.engaged);
  const busy = useStore((s) => s.busy);
  const aiRun = useStore((s) => s.aiRun);
  const aiModel = useStore((s) => s.aiModel);
  const localActivityKey = presenceActivityKey(activeRoomId, LOCAL_USER_ID);
  const localActivity = usePresenceActivityStore((s) => s.byKey[localActivityKey]);

  const isChatRun = aiRun?.runKind === "chat";
  const runVisible =
    isChatRun &&
    (aiRun.status === "running" || aiRun.status === "done" || aiRun.status === "error");

  if (engaged || busy || runVisible) {
    const model = isChatRun ? aiRun.aiModel : aiModel;
    return aiStrokeVariantFromModel(model);
  }

  return aiStrokeVariantFromPresence(localActivity ?? "none");
}

export function useRemoteAiStroke(roomId: string, userId: string): AiStrokeVariant | null {
  const byKey = usePresenceActivityStore((s) => s.byKey);
  const key = presenceActivityKey(roomId, userId);
  const activity = byKey[key] ?? mockPresenceActivityForUser(userId);
  return aiStrokeVariantFromPresence(activity);
}

/** Contour IA pour un participant. */
export function useUserAiStroke(
  roomId: string,
  userId: string,
  isLocal: boolean,
): AiStrokeVariant | null {
  const localStroke = useLocalAiStroke();
  const remoteStroke = useRemoteAiStroke(roomId, userId);
  return isLocal ? localStroke : remoteStroke;
}
