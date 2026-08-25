import clsx from "clsx";
import { Copy, Minus, Square, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { hasFormaDesktop, type DesktopWindowState } from "../../lib/formaDesktop";

/** macOS-fullscreen-style hit target at the very top of the window. */
const TOP_EDGE_HIT_PX = 6;
/** Keep in sync with `--desktop-autohide-titlebar-height`. */
const TITLEBAR_HEIGHT_PX = 32;
const HIDE_DELAY_MS = 400;

function canShowDesktopWindowControls(): boolean {
  const desktop = window.formaDesktop;
  if (!hasFormaDesktop() || !desktop) return false;
  if (desktop.platform !== "win32" && desktop.platform !== "linux") return false;
  return typeof desktop.windowMinimize === "function";
}

export default function DesktopWindowControls() {
  const [enabled] = useState(canShowDesktopWindowControls);
  const [revealed, setRevealed] = useState(false);
  const [windowState, setWindowState] = useState<DesktopWindowState>({
    maximized: true,
    fullScreen: false,
  });
  const hideTimerRef = useRef<number | null>(null);
  const revealedRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current == null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const showBar = useCallback(() => {
    clearHideTimer();
    revealedRef.current = true;
    setRevealed(true);
  }, [clearHideTimer]);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current != null) return;
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      revealedRef.current = false;
      setRevealed(false);
    }, HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.classList.add("has-desktop-autohide-titlebar");
    const desktop = window.formaDesktop;
    void desktop?.getWindowState?.().then((state) => {
      if (state) setWindowState(state);
    });
    const unsubscribe = desktop?.onWindowState?.((state) => {
      setWindowState(state);
    });

    const onPointerMove = (event: PointerEvent) => {
      const y = event.clientY;
      if (y <= TOP_EDGE_HIT_PX) {
        showBar();
        return;
      }
      if (revealedRef.current && y <= TITLEBAR_HEIGHT_PX) {
        showBar();
        return;
      }
      if (revealedRef.current) scheduleHide();
    };
    const onWindowLeave = () => {
      if (revealedRef.current) scheduleHide();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerover", onPointerMove);
    document.documentElement.addEventListener("mouseleave", onWindowLeave);
    return () => {
      root.classList.remove("has-desktop-autohide-titlebar");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerover", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onWindowLeave);
      clearHideTimer();
      unsubscribe?.();
    };
  }, [enabled, showBar, scheduleHide, clearHideTimer]);

  if (!enabled) return null;

  const expanded = windowState.fullScreen || windowState.maximized;
  const desktop = window.formaDesktop;

  return (
    <div
      className={clsx(
        "desktop-window-controls",
        revealed && "desktop-window-controls--revealed",
        expanded && "desktop-window-controls--expanded",
      )}
      role="toolbar"
      aria-label="Fenêtre"
      aria-hidden={!revealed}
    >
      <div
        className="desktop-window-controls__bar"
        onPointerEnter={showBar}
      >
        <div className="desktop-window-controls__drag" aria-hidden />
        <div className="desktop-window-controls__buttons">
          <button
            type="button"
            className="desktop-window-controls__btn"
            onClick={() => void desktop?.windowMinimize?.()}
            aria-label="Réduire"
            title="Réduire"
            tabIndex={revealed ? 0 : -1}
          >
            <Minus size={12} strokeWidth={2.4} aria-hidden />
          </button>
          <button
            type="button"
            className="desktop-window-controls__btn"
            onClick={() => void desktop?.windowToggleFullscreen?.()}
            aria-label={expanded ? "Restaurer" : "Plein écran"}
            title={expanded ? "Restaurer" : "Plein écran"}
            tabIndex={revealed ? 0 : -1}
          >
            {expanded ? (
              <Copy size={11} strokeWidth={2.2} aria-hidden />
            ) : (
              <Square size={11} strokeWidth={2.2} aria-hidden />
            )}
          </button>
          <button
            type="button"
            className="desktop-window-controls__btn desktop-window-controls__btn--close"
            onClick={() => void desktop?.windowClose?.()}
            aria-label="Fermer"
            title="Fermer"
            tabIndex={revealed ? 0 : -1}
          >
            <X size={13} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
