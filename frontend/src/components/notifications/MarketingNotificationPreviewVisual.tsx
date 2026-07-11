import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import clsx from "clsx";

const APP_WIDTH = 1680;
const APP_HEIGHT = 940;
const VISIBLE_WIDTH = 380;
const VISIBLE_HEIGHT = 200;
const SCALE_BOOST = 1.35;
const INSET_X = 45;
const INSET_Y = 14;

function previewSrc(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const params = new URLSearchParams({
    theme: "dark",
    scene: "recording",
    recordingActive: "1",
  });
  return `${base}preview.html?${params.toString()}`;
}

export default function MarketingNotificationPreviewVisual() {
  const mountRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const scaleLayerRef = useRef<HTMLDivElement>(null);
  const previewUrl = useMemo(() => previewSrc(), []);

  const syncScale = useCallback(() => {
    const mount = mountRef.current;
    const wrapper = scalerRef.current;
    const scaleLayer = scaleLayerRef.current;
    if (!mount || !wrapper || !scaleLayer) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;
    if (width <= 0 || height <= 0) return;

    const scale = Math.min(width / VISIBLE_WIDTH, height / VISIBLE_HEIGHT) * SCALE_BOOST;

    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    scaleLayer.style.width = `${APP_WIDTH}px`;
    scaleLayer.style.height = `${APP_HEIGHT}px`;
    scaleLayer.style.transform = `scale(${scale})`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const runSync = () => {
      if (cancelled) return;
      syncScale();
    };

    runSync();
    requestAnimationFrame(() => {
      runSync();
      requestAnimationFrame(runSync);
    });

    window.addEventListener("resize", runSync);

    const mount = mountRef.current;
    let resizeObserver: ResizeObserver | undefined;
    if (mount && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(runSync);
      resizeObserver.observe(mount);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("resize", runSync);
      resizeObserver?.disconnect();
    };
  }, [syncScale]);

  return (
    <div
      ref={mountRef}
      className={clsx(
        "notifications-panel__marketing-preview",
        "notifications-panel__marketing-preview--recording",
      )}
      style={
        {
          "--marketing-preview-inset-x": `${INSET_X}px`,
          "--marketing-preview-inset-y": `${INSET_Y}px`,
        } as CSSProperties
      }
    >
      <div ref={scalerRef} className="notifications-panel__marketing-preview-scaler">
        <div
          ref={scaleLayerRef}
          className="notifications-panel__marketing-preview-scale-layer"
          style={{
            width: APP_WIDTH,
            height: APP_HEIGHT,
          }}
        >
          <iframe
            className="notifications-panel__marketing-preview-frame"
            src={previewUrl}
            title=""
            tabIndex={-1}
            aria-hidden
            loading="eager"
            width={APP_WIDTH}
            height={APP_HEIGHT}
            onLoad={syncScale}
          />
        </div>
      </div>
    </div>
  );
}
