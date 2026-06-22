import clsx from "clsx";
import type { ReactNode } from "react";
import { ChromeSignetLabel } from "../chrome/ChromeSignetLabel";

export default function ParticipantAvatarSignetHost({
  name,
  className,
  children,
}: {
  name: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={clsx("participant-avatar-signet-host forma-signet-host", className)}>
      <ChromeSignetLabel label={name} placement="below-avatar" />
      {children}
    </span>
  );
}
