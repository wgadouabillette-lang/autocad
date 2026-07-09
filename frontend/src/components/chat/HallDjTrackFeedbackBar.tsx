import clsx from "clsx";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { SpotifyTrackCard } from "../../lib/connectorsApi";
import { connectorIconPath, CONNECTOR_ICON_FILES } from "../../lib/connectorIcons";
import { useSpotifyTrackElapsed } from "../../hooks/useSpotifyTrackElapsed";

interface HallDjTrackFeedbackBarProps {
  track: SpotifyTrackCard;
  busy?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export default function HallDjTrackFeedbackBar({
  track,
  busy = false,
  onApprove,
  onReject,
}: HallDjTrackFeedbackBarProps) {
  const elapsed = useSpotifyTrackElapsed();

  return (
    <div className="hall-dj-track-feedback" role="group" aria-label="Feedback Hall DJ">
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
      </div>
    </div>
  );
}
