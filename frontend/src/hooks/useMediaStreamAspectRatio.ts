import { useEffect, useState } from "react";

const DEFAULT_ASPECT_RATIO = "16 / 9";

function readTrackAspectRatio(track: MediaStreamTrack): string | null {
  const { width, height } = track.getSettings();
  if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
    return `${width} / ${height}`;
  }
  return null;
}

function measureViaVideoElement(stream: MediaStream): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const finish = (ratio: string | null) => {
      video.srcObject = null;
      video.remove();
      resolve(ratio);
    };

    video.addEventListener(
      "loadedmetadata",
      () => {
        const width = video.videoWidth;
        const height = video.videoHeight;
        finish(width > 0 && height > 0 ? `${width} / ${height}` : null);
      },
      { once: true },
    );
    video.addEventListener("error", () => finish(null), { once: true });
    void video.play().catch(() => undefined);
  });
}

/** Live aspect ratio (`width / height`) for a camera or screen-share stream. */
export function useMediaStreamAspectRatio(
  stream: MediaStream | null | undefined,
  enabled = true,
): string {
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);

  useEffect(() => {
    if (!enabled || !stream) {
      setAspectRatio(DEFAULT_ASPECT_RATIO);
      return;
    }

    const track =
      stream.getVideoTracks().find((entry) => entry.readyState === "live") ??
      stream.getVideoTracks()[0];
    if (!track) {
      setAspectRatio(DEFAULT_ASPECT_RATIO);
      return;
    }

    let cancelled = false;

    const sync = async () => {
      const fromTrack = readTrackAspectRatio(track);
      if (fromTrack) {
        if (!cancelled) setAspectRatio(fromTrack);
        return;
      }
      const fromVideo = await measureViaVideoElement(stream);
      if (!cancelled) setAspectRatio(fromVideo ?? DEFAULT_ASPECT_RATIO);
    };

    void sync();

    const onResize = () => {
      const next = readTrackAspectRatio(track);
      if (next) setAspectRatio(next);
    };
    track.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      track.removeEventListener("resize", onResize);
    };
  }, [enabled, stream]);

  return aspectRatio;
}
