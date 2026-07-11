import clsx from "clsx";
import djIcon from "../../assets/icons/dj.webp";

interface HallDjDiscoIconProps {
  size?: number;
  className?: string;
}

/** Spotify DJ mark — green ring inset inside blue disc (scale ~0.72). */
export default function HallDjDiscoIcon({
  size = 24,
  className,
}: HallDjDiscoIconProps) {
  return (
    <img
      src={djIcon}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={clsx("hall-dj-disco-icon", className)}
      aria-hidden
    />
  );
}

