import clsx from "clsx";
import type { ReactNode } from "react";
import { ChromeSignetLabel, type SignetPlacement } from "../chrome/ChromeSignetLabel";

export default function ParticipantAvatarSignetHost({
  name,
  className,
  placement = "below-avatar",
  children,
}: {
  name: string;
  className?: string;
  placement?: SignetPlacement;
  children: ReactNode;
}) {
  return (
    <span className={clsx("participant-avatar-signet-host forma-signet-host", className)}>
      <ChromeSignetLabel label={name} placement={placement} />
      {children}
    </span>
  );
}
