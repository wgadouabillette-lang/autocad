import clsx from "clsx";
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
} from "react";
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
  onPointerEnter,
  onFocus,
  disabled,
  active,
  danger,
  recording,
  badge,
  segment,
  signetAlign = "center",
  showSignet = true,
  className,
  children,
}: {
  label: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
  recording?: boolean;
  badge?: number;
  segment?: SegmentRole;
  /** Décale le signet vers le centre de l'écran pour éviter le clipping aux bords. */
  signetAlign?: SignetAlign;
  /** Tooltip signet au survol — désactiver si un contrôle flottant est juste au-dessus. */
  showSignet?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-segment={segment}
      className={clsx(
        "bottom-bar-btn",
        showSignet && signetHostClassName(signetAlign),
        active && "is-active",
        danger && "is-danger",
        recording && "is-recording",
        disabled && "is-disabled",
        className,
      )}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      disabled={disabled}
      aria-label={label}
      title={!showSignet ? label : undefined}
      aria-pressed={active}
    >
      {showSignet ? <ChromeSignetLabel label={label} placement="above" /> : null}
      {children}
      {badge != null && badge > 0 && <span className="forma-unread-dot" aria-hidden />}
    </button>
  );
}
