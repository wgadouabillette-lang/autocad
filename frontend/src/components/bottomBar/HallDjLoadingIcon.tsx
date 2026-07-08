import clsx from "clsx";

interface HallDjLoadingIconProps {
  size?: number;
  className?: string;
}

export default function HallDjLoadingIcon({ size = 19, className }: HallDjLoadingIconProps) {
  return (
    <span
      className={clsx("hall-dj-loading-icon", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="hall-dj-loading-icon__ring" />
    </span>
  );
}
