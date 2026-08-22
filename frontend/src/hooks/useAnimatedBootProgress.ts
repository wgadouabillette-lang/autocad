import { useEffect, useRef, useState } from "react";

const BOOT_CAP = 90;
const BOOT_TAU_MS = 2200;
const FINISH_MS = 180;
const REVEAL_HOLD_MS = 70;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function easeTowardCap(elapsedMs: number): number {
  return BOOT_CAP * (1 - Math.exp(-elapsedMs / BOOT_TAU_MS));
}

/**
 * Windows packaged Electron often never plays CSS keyframe splash animations
 * (no Vite HMR, compositor-quiet frameless window). Drive the bar from JS:
 * ease toward ~90% while booting, then finish to 100% before revealing.
 */
export function useAnimatedBootProgress(options: {
  pending: boolean;
  externalProgress?: number | null;
}): { progress: number; holdOverlay: boolean } {
  const { pending, externalProgress = null } = options;
  const [progress, setProgress] = useState(0);
  const [holdOverlay, setHoldOverlay] = useState(true);
  const pendingRef = useRef(pending);
  const externalRef = useRef(externalProgress);
  const progressRef = useRef(0);
  const startedAtRef = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  const finishStartedAtRef = useRef<number | null>(null);
  const finishFromRef = useRef(0);

  pendingRef.current = pending;
  externalRef.current = externalProgress;
  progressRef.current = progress;

  useEffect(() => {
    if (!pending) return;
    startedAtRef.current = performance.now();
    finishStartedAtRef.current = null;
    progressRef.current = 0;
    setHoldOverlay(true);
    setProgress(0);
  }, [pending]);

  useEffect(() => {
    let raf = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const ext =
        externalRef.current == null
          ? 0
          : clampPercent(externalRef.current);

      if (pendingRef.current) {
        finishStartedAtRef.current = null;
        const eased = easeTowardCap(now - startedAtRef.current);
        const next = ext >= 100 ? 100 : Math.max(eased, ext > 0 ? ext : 0);
        const clamped = clampPercent(Math.min(next, ext >= 100 ? 100 : 99));
        if (Math.abs(clamped - progressRef.current) >= 0.25) {
          progressRef.current = clamped;
          setProgress(clamped);
        }
        raf = window.requestAnimationFrame(tick);
        return;
      }

      if (finishStartedAtRef.current == null) {
        finishStartedAtRef.current = now;
        finishFromRef.current = Math.max(
          progressRef.current,
          ext,
          easeTowardCap(now - startedAtRef.current),
        );
      }
      const t = Math.min(1, (now - finishStartedAtRef.current) / FINISH_MS);
      const easedFinish = 1 - (1 - t) * (1 - t);
      const next = clampPercent(
        finishFromRef.current + (100 - finishFromRef.current) * easedFinish,
      );
      if (Math.abs(next - progressRef.current) >= 0.25 || t >= 1) {
        progressRef.current = next;
        setProgress(next);
      }
      if (t < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [pending]);

  useEffect(() => {
    if (pending || progress < 100) return;
    const id = window.setTimeout(() => setHoldOverlay(false), REVEAL_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [pending, progress]);

  return { progress, holdOverlay };
}
