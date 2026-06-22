import clsx from "clsx";
import { Children, Fragment, cloneElement, isValidElement, type ReactElement } from "react";
import { ChromeSignetLabel, signetHostClassName, type SignetAlign } from "../chrome/ChromeSignetLabel";

export type SegmentRole = "start" | "middle" | "end" | "single";

function capsuleButtonItems(children: React.ReactNode): ReactElement<{ segment?: SegmentRole }>[] {
  const items: ReactElement<{ segment?: SegmentRole }>[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      Children.forEach(child.props.children, (nested) => {
        if (isValidElement(nested)) {
          items.push(nested as ReactElement<{ segment?: SegmentRole }>);
        }
      });
      return;
    }
    items.push(child as ReactElement<{ segment?: SegmentRole }>);
  });

  return items;
}

export function BottomBarCapsule({ children }: { children: React.ReactNode }) {
  const items = capsuleButtonItems(children);

  return (
    <div className="bottom-bar-capsule">
      {items.map((child, index) => {
        const segment: SegmentRole =
          items.length === 1
            ? "single"
            : index === 0
              ? "start"
              : index === items.length - 1
                ? "end"
                : "middle";

        return cloneElement(child, {
          key: child.key ?? `bottom-bar-${index}`,
          segment,
        });
      })}
    </div>
  );
}

export function BottomBarButton({
  label,
  onClick,
  disabled,
  active,
  danger,
  recording,
  badge,
  segment,
  signetAlign = "center",
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  recording?: boolean;
  badge?: number;
  segment?: SegmentRole;
  /** Décale le signet vers le centre de l'écran pour éviter le clipping aux bords. */
  signetAlign?: SignetAlign;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-segment={segment}
      className={clsx(
        "bottom-bar-btn",
        signetHostClassName(signetAlign),
        active && "is-active",
        danger && "is-danger",
        recording && "is-recording",
        disabled && "is-disabled",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
    >
      <ChromeSignetLabel label={label} placement="above" />
      {children}
      {badge != null && badge > 0 && <span className="forma-unread-dot" aria-hidden />}
    </button>
  );
}
