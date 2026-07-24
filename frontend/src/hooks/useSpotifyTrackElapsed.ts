import { useEffect, useState } from "react";
import {
  isMarketingPreview,
  MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC,
} from "../lib/marketingPreview";
import { getSpotifyPlaybackPositionSec } from "../lib/spotifyWebPlayback";
import { getSpotifyPreviewAudioElement, useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function useSpotifyTrackElapsed(): string {
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const playbackMode = useSpotifyPlayerStore((s) => s.playbackMode);
  const currentTrackId = useSpotifyPlayerStore((s) => s.currentTrack?.id);
  const [elapsedSec, setElapsedSec] = useState(
    isMarketingPreview() ? MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC : 0,
  );

  useEffect(() => {
    if (isMarketingPreview()) {
      setElapsedSec(MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC);
      return;
    }

    if (!currentTrackId) {
      setElapsedSec(0);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      if (playbackMode === "preview") {
        const audio = getSpotifyPreviewAudioElement();
        setElapsedSec(audio?.currentTime ?? 0);
        return;
      }

      if (playbackMode === "full") {
        const position = await getSpotifyPlaybackPositionSec();
        if (!cancelled && position !== null) {
          setElapsedSec(position);
        }
        return;
      }

      setElapsedSec(0);
    };

    void tick();
    const intervalId = window.setInterval(() => void tick(), playing ? 500 : 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [playing, playbackMode, currentTrackId]);

  return formatElapsed(elapsedSec);
}
