import clsx from "clsx";
import type { HTMLAttributes } from "react";
import { avatarColor, userInitials } from "../lib/calls";
import { useStore } from "../store/useStore";

interface UserAvatarProps extends HTMLAttributes<HTMLElement> {
  userId: string;
  name: string;
  photoURL?: string | null;
  isLocal?: boolean;
  className?: string;
  shape?: "circle" | "fill";
}

export default function UserAvatar({
  userId,
  name,
  photoURL: photoURLProp,
  isLocal = false,
  className,
  shape = "circle",
  ...rest
}: UserAvatarProps) {
  const localPhotoURL = useStore((s) => s.photoURL);
  const photoURL = isLocal
    ? (localPhotoURL ?? photoURLProp ?? null)
    : (photoURLProp ?? null);
  const shapeClass = shape === "fill" ? "user-avatar--fill" : undefined;

  if (photoURL) {
    return (
      <img
        key={photoURL}
        src={photoURL}
        alt=""
        className={clsx("user-avatar", shapeClass, className)}
        {...(rest as HTMLAttributes<HTMLImageElement>)}
      />
    );
  }

  return (
    <span
      className={clsx("user-avatar", shapeClass, className)}
      style={{ backgroundColor: avatarColor(userId) }}
      aria-hidden={rest["aria-hidden"] ?? true}
      {...rest}
    >
      {userInitials(name)}
    </span>
  );
}
