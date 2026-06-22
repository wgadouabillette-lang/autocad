import clsx from "clsx";

export type SignetAlign = "center" | "inward-start" | "inward-start-more" | "inward-end";
export type SignetPlacement = "above" | "below" | "below-avatar";

export function ChromeSignetLabel({
  label,
  placement = "above",
}: {
  label: string;
  placement?: SignetPlacement;
}) {
  return (
    <span
      className={clsx(
        "forma-signet",
        placement === "above"
          ? "forma-signet--above"
          : placement === "below-avatar"
            ? "forma-signet--below forma-signet--below-avatar"
            : "forma-signet--below",
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}

export function signetHostClassName(
  align: SignetAlign = "center",
  extra?: string,
): string {
  return clsx(
    "forma-signet-host",
    align === "inward-start" && "forma-signet-host--inward-start",
    align === "inward-start-more" && "forma-signet-host--inward-start-more",
    align === "inward-end" && "forma-signet-host--inward-end",
    extra,
  );
}
