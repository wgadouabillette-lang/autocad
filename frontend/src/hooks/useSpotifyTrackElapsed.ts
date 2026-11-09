import { useEffect, useState } from "react";
import {
  isMarketingPreview,
  isMarketingRecordingPreviewScene,
  MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC,
  MARKETING_RECORDING_DJ_DURATION_SEC,
  MARKETING_RECORDING_DJ_ELAPSED_SEC,
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

function marketingPreviewClock(): { elapsed: number; duration: number } {
  if (isMarketingRecordingPreviewScene()) {
    return {
      elapsed: MARKETING_RECORDING_DJ_ELAPSED_SEC,
      duration: MARKETING_RECORDING_DJ_DURATION_SEC,
    };
  }
  return {
    elapsed: MARKETING_PREVIEW_SPOTIFY_ELAPSED_SEC,
    duration: MARKETING_PREVIEW_DURATION_SEC,
  };
}

export function useSpotifyTrackProgress(): SpotifyTrackProgress {
  const playing = useSpotifyPlayerStore((s) => s.playing);
  const playbackMode = useSpotifyPlayerStore((s) => s.playbackMode);
  const currentTrackId = useSpotifyPlayerStore((s) => s.currentTrack?.id);
  const trackDurationMs = useSpotifyPlayerStore((s) => s.currentTrack?.durationMs);
  const previewClock = isMarketingPreview() ? marketingPreviewClock() : null;
  const [elapsedSec, setElapsedSec] = useState(previewClock?.elapsed ?? 0);
  const [durationSec, setDurationSec] = useState(previewClock?.duration ?? 0);

  useEffect(() => {
    if (isMarketingPreview()) {
      const clock = marketingPreviewClock();
      setElapsedSec(clock.elapsed);
      setDurationSec(clock.duration);
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
    seedSpotifyPlaybackDurationMs(trackDurationMs, currentTrackId);

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
        seedSpotifyPlaybackDurationMs(trackDurationMs, currentTrackId);
        const position = await getSpotifyPlaybackPositionSec();
        if (!cancelled && position !== null) {
          setElapsedSec(position);
        }
        // This song's metadata is the bar's length. A leftover SDK duration
        // from the previous track must not stretch or shrink it.
        if (!cancelled) {
          if (seeded > 0) {
            setDurationSec(seeded);
          } else {
            const duration = getSpotifyPlaybackDurationSecSync();
            if (duration !== null && duration > 0) setDurationSec(duration);
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
