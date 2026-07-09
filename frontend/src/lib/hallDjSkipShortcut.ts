import { useHallDjStore } from "../store/useHallDjStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { useStore } from "../store/useStore";

export function isAgentChatEmpty(): boolean {
  const { chat, chatPanelMode } = useStore.getState();
  if (chatPanelMode !== "agent") return false;
  return !chat.some((message) => message.role === "user" || message.role === "assistant");
}

export function canTriggerHallDjSkipShortcut(): boolean {
  const hallDj = useHallDjStore.getState();
  return hallDj.active && !hallDj.loading && isAgentChatEmpty();
}

export function triggerHallDjSkipFromShortcut(): void {
  if (!canTriggerHallDjSkipShortcut()) return;

  const hallDj = useHallDjStore.getState();
  const spotify = useSpotifyPlayerStore.getState();
  const trackId = spotify.currentTrack?.id?.trim();
  const pendingFeedback =
    Boolean(trackId) &&
    hallDj.feedbackResolvedTrackId !== trackId &&
    !hallDj.feedbackBusy;

  if (pendingFeedback) {
    void hallDj.rateCurrentTrack("reject");
    return;
  }

  void hallDj.skipNext();
}
