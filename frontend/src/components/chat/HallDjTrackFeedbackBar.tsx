import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { SpotifyTrackCard } from "../../lib/connectorsApi";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";
import { useSpotifyTrackElapsed, useSpotifyTrackProgress } from "../../hooks/useSpotifyTrackElapsed";

/** Match Tailwind `rounded-xl` on the chat composer. */
const COMPOSER_CORNER_RADIUS_PX = 12;

interface HallDjTrackFeedbackBarProps {
  track: SpotifyTrackCard;
  busy?: boolean;
  /** Meetra DJ thumbs — hidden for /play now-playing. */
  showFeedback?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

/**
 * Progress stroke above the composer (separate), with end curves matching
 * the composer’s top rounded corners so it sits flush along the full edge.
 */
export function HallDjTrackProgressRail() {
  const { progress } = useSpotifyTrackProgress();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const r = COMPOSER_CORNER_RADIUS_PX;
  const w = Math.max(Math.round(width), r * 2 + 1);
  // Top edge of a rounded rect: left arc → straight → right arc.
  const d = `M 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r}`;

  return (
    <div
      ref={wrapRef}
      className="hall-dj-track-feedback__progress-rail"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Progression de la piste"
    >
      {width > 0 ? (
        <svg
          className="hall-dj-track-feedback__progress-svg"
          width={w}
          height={r}
          viewBox={`0 0 ${w} ${r}`}
          aria-hidden
        >
          <path
            className="hall-dj-track-feedback__progress-track"
            d={d}
            pathLength={1}
            fill="none"
            strokeWidth={2}
            strokeLinecap="butt"
            strokeDasharray="1"
          />
          <path
            className="hall-dj-track-feedback__progress-fill"
            d={d}
            pathLength={1}
            fill="none"
            strokeWidth={2}
            strokeLinecap="butt"
            strokeDasharray={`${Math.max(0, Math.min(1, progress))} 1`}
          />
        </svg>
      ) : null}
    </div>
  );
}

export default function HallDjTrackFeedbackBar({
  track,
  busy = false,
  showFeedback = true,
  onApprove,
  onReject,
}: HallDjTrackFeedbackBarProps) {
  const elapsed = useSpotifyTrackElapsed();

  return (
    <div
      className="hall-dj-track-feedback"
      role="group"
      aria-label={showFeedback ? "Feedback Meetra DJ" : "Lecture Spotify"}
    >
      <div className="hall-dj-track-feedback__row">
        <div className="hall-dj-track-feedback__art" aria-hidden>
          {track.imageUrl ? (
            <img
              src={track.imageUrl}
              alt=""
              className="hall-dj-track-feedback__cover"
              draggable={false}
            />
          ) : (
            <img
              src={connectorIconPath(CONNECTOR_ICON_FILES.spotify)}
              alt=""
              className="hall-dj-track-feedback__cover hall-dj-track-feedback__cover--fallback"
              draggable={false}
            />
          )}
        </div>

        <div className="hall-dj-track-feedback__meta min-w-0 flex-1">
          <p className="hall-dj-track-feedback__title truncate" title={track.name}>
            {track.name}
          </p>
          {track.artists ? (
            <p className="hall-dj-track-feedback__artist truncate" title={track.artists}>
              {track.artists}
            </p>
          ) : null}
        </div>

        <div className="hall-dj-track-feedback__actions">
          <span className="hall-dj-track-feedback__elapsed" aria-label={`Temps écoulé ${elapsed}`}>
            {elapsed}
          </span>
          {showFeedback ? (
            <>
              <button
                type="button"
                className={clsx("hall-dj-track-feedback__btn", "hall-dj-track-feedback__btn--reject")}
                disabled={busy}
                aria-label={`Not for me — ${track.name}`}
                onClick={onReject}
              >
                <ThumbsDown size={14} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                className={clsx("hall-dj-track-feedback__btn", "hall-dj-track-feedback__btn--approve")}
                disabled={busy}
                aria-label={`Vouch — ${track.name}`}
                onClick={onApprove}
              >
                <ThumbsUp size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
