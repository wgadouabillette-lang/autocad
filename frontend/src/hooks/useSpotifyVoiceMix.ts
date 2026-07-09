import { useEffect } from "react";
import { setMicrophoneEnabled } from "../lib/localMedia";
import { setSpotifyVoiceMixActive } from "../lib/spotifyVoiceMix";
import { useCallsStore } from "../store/useCallsStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { useStore } from "../store/useStore";

/** Keep the mic usable while Spotify is playing in the workspace. */
export function useSpotifyVoiceMix(): void {
  const spotifyActive = useSpotifyPlayerStore(
    (s) => s.playing && s.playbackMode !== null,
  );
  const activeRoomId = useStore((s) => s.activeRoomId);
  const callsViewMode = useCallsStore((s) => s.getCallsViewMode(activeRoomId));
  const inBlockCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const inTheaterCall = useCallsStore((s) => s.isLocalInTheaterCall(activeRoomId));
  const inVoice = callsViewMode === "theater" ? inTheaterCall : inBlockCall;
  const muted = useCallsStore((s) => s.muted);

  useEffect(() => {
    void (async () => {
      await setSpotifyVoiceMixActive(spotifyActive);
      if (spotifyActive && inVoice && !muted) {
        setMicrophoneEnabled(true);
      }
    })();
    return () => {
      void setSpotifyVoiceMixActive(false);
    };
  }, [spotifyActive, inVoice, muted]);
}
