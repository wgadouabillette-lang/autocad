import { useEffect, useState } from "react";
import { startSpotifyPulseMonitor } from "../lib/spotifyAudioPulse";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";

export function useSpotifyAudioPulse(): number {
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const playbackMode = useSpotifyPlayerStore((s) => s.playbackMode);
  const currentTrack = useSpotifyPlayerStore((s) => s.currentTrack);
  const [pulseLevel, setPulseLevel] = useState(0);

  useEffect(() => {
    const trackId = currentTrack?.id?.trim();
    if ((!playing && playbackMode === null) || !trackId) {
      setPulseLevel(0);
      return;
    }

    return startSpotifyPulseMonitor(trackId, playbackMode ?? "preview", setPulseLevel);
  }, [playing, playbackMode, currentTrack?.id]);

  return pulseLevel;
}
