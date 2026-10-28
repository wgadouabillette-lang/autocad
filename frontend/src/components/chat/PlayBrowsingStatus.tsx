import { useEffect, useState } from "react";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";

const PLAY_BROWSING_MIN_MS = 5000;
const PLAY_BROWSING_MAX_MS = 8000;

let lastPlayBrowsingMs = -1;

/** Durée entre 5 et 8 s, toujours différente de la précédente. */
export function pickPlayBrowsingMs(): number {
  const span = PLAY_BROWSING_MAX_MS - PLAY_BROWSING_MIN_MS;
  const roll = Math.floor(Math.random() * (span + 1));
  let ms = PLAY_BROWSING_MIN_MS + roll;
  if (ms === lastPlayBrowsingMs) {
    const step = 1 + Math.floor(Math.random() * span);
    ms = PLAY_BROWSING_MIN_MS + ((roll + step) % (span + 1));
  }
  lastPlayBrowsingMs = ms;
  return ms;
}

function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export default function PlayBrowsingStatus({ startedAt }: { startedAt: number }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const tick = () => setElapsedSeconds(Math.floor(Math.max(0, Date.now() - startedAt) / 1000));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="play-browsing" role="status">
      <img
        src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
        alt=""
        className="play-browsing__icon"
        draggable={false}
      />
      <span className="play-browsing__label text-shimmer">finding best correspondance</span>
      <span className="play-browsing__timer" aria-hidden>
        {formatElapsed(elapsedSeconds)}
      </span>
    </div>
  );
}
