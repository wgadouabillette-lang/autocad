import clsx from "clsx";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { SpotifyTrackCard } from "../../lib/connectorsApi";

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
  return (
    <div className="hall-dj-track-feedback" role="group" aria-label="Feedback Hall DJ">
      <button
        type="button"
        className={clsx("hall-dj-track-feedback__btn", "hall-dj-track-feedback__btn--approve")}
        disabled={busy}
        aria-label={`Accept ${track.name}`}
        onClick={onApprove}
      >
        <ThumbsUp size={13} aria-hidden />
        <span>Accept</span>
      </button>
      <button
        type="button"
        className={clsx("hall-dj-track-feedback__btn", "hall-dj-track-feedback__btn--reject")}
        disabled={busy}
        aria-label={`Not for me — ${track.name}`}
        onClick={onReject}
      >
        <ThumbsDown size={13} aria-hidden />
        <span>Not for me</span>
      </button>
    </div>
  );
}
