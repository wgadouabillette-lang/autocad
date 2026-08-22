import clsx from "clsx";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { hasFormaDesktop, type DesktopWindowState } from "../../lib/formaDesktop";

function canShowDesktopWindowControls(): boolean {
  const desktop = window.formaDesktop;
  if (!hasFormaDesktop() || !desktop) return false;
  if (desktop.platform !== "win32" && desktop.platform !== "linux") return false;
  return typeof desktop.windowMinimize === "function";
}

export default function DesktopWindowControls() {
  const [visible] = useState(canShowDesktopWindowControls);
  const [windowState, setWindowState] = useState<DesktopWindowState>({
    maximized: true,
    fullScreen: false,
  });

  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.classList.add("has-desktop-window-controls");
    const desktop = window.formaDesktop;
    void desktop?.getWindowState?.().then((state) => {
      if (state) setWindowState(state);
    });
    const unsubscribe = desktop?.onWindowState?.((state) => {
      setWindowState(state);
    });
    return () => {
      root.classList.remove("has-desktop-window-controls");
      unsubscribe?.();
    };
  }, [visible]);

  if (!visible) return null;

  const expanded = windowState.fullScreen || windowState.maximized;
  const desktop = window.formaDesktop;

  return (
    <div
      className={clsx("desktop-window-controls", expanded && "desktop-window-controls--expanded")}
      role="toolbar"
      aria-label="Fenêtre"
    >
      <button
        type="button"
        className="desktop-window-controls__btn"
        onClick={() => void desktop?.windowMinimize?.()}
        aria-label="Réduire"
        title="Réduire"
      >
        <Minus size={12} strokeWidth={2.4} aria-hidden />
      </button>
      <button
        type="button"
        className="desktop-window-controls__btn"
        onClick={() => void desktop?.windowToggleFullscreen?.()}
        aria-label={expanded ? "Restaurer" : "Plein écran"}
        title={expanded ? "Restaurer" : "Plein écran"}
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
      >
        <X size={13} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
