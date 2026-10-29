import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { isFormaDesktopWindows } from "../../lib/formaDesktop";

/**
 * Chromium blurs a <video> that shows the page's own screen capture.
 * Peers receive the sharp frames. Paint those frames on a canvas so the
 * sharer sees the same image. On Windows the local preview stays blurred.
 */
export default function LocalScreenSharePreview({
  stream,
  className,
}: {
  stream: MediaStream;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fallback, setFallback] = useState(false);
  const previewClass = clsx(className, isFormaDesktopWindows() && "local-screen-share-preview--blurred");

  useEffect(() => {
    setFallback(false);
  }, [stream]);

  useEffect(() => {
    if (fallback) return;
    const canvas = canvasRef.current;
    const track =
      stream.getVideoTracks().find((item) => item.readyState === "live") ??
      stream.getVideoTracks()[0];
    const TrackProcessor = (
      globalThis as unknown as {
        MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => {
          readable: ReadableStream<VideoFrame>;
        };
      }
    ).MediaStreamTrackProcessor;
    if (!canvas || !track || typeof TrackProcessor === "undefined") {
      setFallback(true);
      return;
    }

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      setFallback(true);
      return;
    }

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<VideoFrame>;
    try {
      const processor = new TrackProcessor({ track });
      reader = processor.readable.getReader();
    } catch {
      setFallback(true);
      return;
    }

    const pump = async () => {
      try {
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done || !value || cancelled) {
            value?.close();
            break;
          }
          const width = value.displayWidth || value.codedWidth;
          const height = value.displayHeight || value.codedHeight;
          if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
            canvas.width = width;
            canvas.height = height;
          }
          if (canvas.width > 0 && canvas.height > 0) {
            context.drawImage(value, 0, 0, canvas.width, canvas.height);
          }
          value.close();
        }
      } catch {
        if (!cancelled) setFallback(true);
      }
    };

    void pump();

    return () => {
      cancelled = true;
      void reader.cancel().catch(() => {});
    };
  }, [stream, fallback]);

  useEffect(() => {
    if (!fallback) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => {
      video.srcObject = null;
    };
  }, [fallback, stream]);

  if (fallback) {
    return <video ref={videoRef} autoPlay muted playsInline className={previewClass} />;
  }

  return <canvas ref={canvasRef} className={clsx("block", previewClass)} />;
}
