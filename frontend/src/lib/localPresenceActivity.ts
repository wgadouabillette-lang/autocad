import { presenceActivityFromModel } from "./aiModelStroke";
import { isManualPresenceActivity, presenceActivityKey, type PresenceActivityId } from "./presenceActivity";
import { useAiComposerStore } from "../store/useAiComposerStore";
import { useCallsStore } from "../store/useCallsStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { useStore } from "../store/useStore";

/** Activité locale poussée sur Firestore (sans écraser le choix manuel en store). */
export function getLocalPresenceActivityForSync(workspaceId: string): PresenceActivityId | null {
  const stored =
    usePresenceActivityStore.getState().byKey[presenceActivityKey(workspaceId, "local")] ?? "none";

  const { playing, currentTrack } = useSpotifyPlayerStore.getState();
  const viewMode = useCallsStore.getState().getCallsViewMode(workspaceId);
  const openChannelId = useCallsStore.getState().localOpenChannelByRoom[workspaceId];
  const inTheater =
    viewMode === "theater" || useCallsStore.getState().isLocalInTheaterCall(workspaceId);
  // Spotify (play / DJ) uniquement dans le salon privé — prioritaire sur l'IA.
  const inPrivateSalon = !openChannelId && !inTheater;

  if (playing && currentTrack && inPrivateSalon) {
    return "spotify";
  }

  const aiComposerEngaged = useAiComposerStore.getState().engaged;
  const aiRun = useStore.getState().aiRun;
  const aiModel = useStore.getState().aiModel;
  const aiGenerating = aiRun?.status === "running" && aiRun.runKind === "chat";

  if (aiComposerEngaged || aiGenerating) {
    const model = aiGenerating ? aiRun!.aiModel : aiModel;
    return presenceActivityFromModel(model);
  }

  if (isManualPresenceActivity(stored)) return stored;
  if (stored === "recording") return "recording";
  return null;
}

export function getLocalBlockPresenceActivityDisplay(
  workspaceId: string,
): PresenceActivityId | "unset" {
  const activity = getLocalPresenceActivityForSync(workspaceId);
  if (!activity || activity === "none") return "unset";
  return activity;
}
