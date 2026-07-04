import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const MENU_GAP = 6;
const MIN_WIDTH = 224;

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface Props {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  menuRef?: RefObject<HTMLDivElement>;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

export default function MentionFloatingMenu({
  open,
  anchorRef,
  menuRef,
  ariaLabel = "Mentions",
  className,
  children,
}: Props) {
  const [pos, setPos] = useState<MenuPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(MIN_WIDTH, rect.width);
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const top = rect.top - MENU_GAP;
    const maxHeight = Math.max(120, top - 8);
    setPos({ top, left, width, maxHeight });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const onLayout = () => updatePosition();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, updatePosition]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={clsx("chat-composer-floating-menu", className)}
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
        transform: "translateY(-100%)",
      }}
      role="listbox"
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body,
  );
}
