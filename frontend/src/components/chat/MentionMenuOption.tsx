import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface MentionMenuOptionProps {
  active: boolean;
  title: string;
  meta: string;
  onClick: () => void;
  onMouseEnter: () => void;
  icon?: LucideIcon;
  iconNode?: ReactNode;
}

export default function MentionMenuOption({
  active,
  title,
  meta,
  onClick,
  onMouseEnter,
  icon: Icon,
  iconNode,
}: MentionMenuOptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={clsx(
        "chat-composer-floating-menu__item",
        active && "chat-composer-floating-menu__item--active",
      )}
    >
      {iconNode ?? (Icon ? (
        <span className="chat-composer-floating-menu__icon" aria-hidden>
          <Icon size={14} strokeWidth={2} />
        </span>
      ) : null)}
      <span className="chat-composer-floating-menu__body">
        <span className="chat-composer-floating-menu__title">{title}</span>
        <span className="chat-composer-floating-menu__meta">{meta}</span>
      </span>
    </button>
  );
}
