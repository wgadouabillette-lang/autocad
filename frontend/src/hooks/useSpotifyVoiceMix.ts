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
  const inCall = useCallsStore((s) => s.isLocalInCall(activeRoomId));
  const muted = useCallsStore((s) => s.muted);

  useEffect(() => {
    void (async () => {
      await setSpotifyVoiceMixActive(spotifyActive);
      if (spotifyActive && inCall && !muted) {
        setMicrophoneEnabled(true);
      }
    })();
    return () => {
      void setSpotifyVoiceMixActive(false);
    };
  }, [spotifyActive, inCall, muted]);
}
