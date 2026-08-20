import { useEffect, useState } from "react";
import {
  isMarketingPreview,
  MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC,
} from "../lib/marketingPreview";
import {
  getSpotifyPlaybackDurationSecSync,
  getSpotifyPlaybackPositionSec,
  seedSpotifyPlaybackDurationMs,
} from "../lib/spotifyWebPlayback";
import { getSpotifyPreviewAudioElement, useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export interface SpotifyTrackProgress {
  /** Formatted mm:ss elapsed. */
  elapsed: string;
  /** 0–1 playback progress; 0 when duration unknown. */
  progress: number;
}

const MARKETING_PREVIEW_DURATION_SEC = 210;

export function useSpotifyTrackProgress(): SpotifyTrackProgress {
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const playbackMode = useSpotifyPlayerStore((s) => s.playbackMode);
  const currentTrackId = useSpotifyPlayerStore((s) => s.currentTrack?.id);
  const trackDurationMs = useSpotifyPlayerStore((s) => s.currentTrack?.durationMs);
  const [elapsedSec, setElapsedSec] = useState(
    isMarketingPreview() ? MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC : 0,
  );
  const [durationSec, setDurationSec] = useState(
    isMarketingPreview() ? MARKETING_PREVIEW_DURATION_SEC : 0,
  );

  useEffect(() => {
    if (isMarketingPreview()) {
      setElapsedSec(MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC);
      setDurationSec(MARKETING_PREVIEW_DURATION_SEC);
      return;
    }

    if (!currentTrackId) {
      setElapsedSec(0);
      setDurationSec(0);
      return;
    }

    // Immediate reset on track change so the bar never inherits the previous song.
    setElapsedSec(0);
    const seeded =
      typeof trackDurationMs === "number" && Number.isFinite(trackDurationMs) && trackDurationMs > 0
        ? trackDurationMs / 1000
        : 0;
    setDurationSec(seeded);
    seedSpotifyPlaybackDurationMs(trackDurationMs);

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      if (playbackMode === "preview") {
        const audio = getSpotifyPreviewAudioElement();
        setElapsedSec(audio?.currentTime ?? 0);
        const dur = audio?.duration;
        if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
          setDurationSec(dur);
        } else if (seeded > 0) {
          setDurationSec(Math.min(seeded, 30));
        } else {
          setDurationSec(30);
        }
        return;
      }

      if (playbackMode === "full") {
        seedSpotifyPlaybackDurationMs(trackDurationMs);
        const position = await getSpotifyPlaybackPositionSec();
        if (!cancelled && position !== null) {
          setElapsedSec(position);
        }
        const duration = getSpotifyPlaybackDurationSecSync();
        if (!cancelled) {
          if (duration !== null && duration > 0) {
            setDurationSec(duration);
          } else if (seeded > 0) {
            setDurationSec(seeded);
          }
        }
        return;
      }

      setElapsedSec(0);
      setDurationSec(seeded);
    };

    void tick();
    const intervalId = window.setInterval(() => void tick(), playing ? 250 : 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [playing, playbackMode, currentTrackId, trackDurationMs]);

  const progress =
    durationSec > 0 ? Math.min(1, Math.max(0, elapsedSec / durationSec)) : 0;

  return {
    elapsed: formatElapsed(elapsedSec),
    progress,
  };
}

export function useSpotifyTrackElapsed(): string {
  return useSpotifyTrackProgress().elapsed;
}
