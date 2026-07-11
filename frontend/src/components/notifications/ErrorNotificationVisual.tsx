import {
  AlertCircle,
  Building2,
  Link2Off,
  MessageSquare,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { ErrorNotificationVisualVariant } from "../../lib/notificationErrorVisual";

const ICON_BY_VARIANT: Record<ErrorNotificationVisualVariant, LucideIcon> = {
  message: MessageSquare,
  friend: UserPlus,
  connector: Link2Off,
  workspace: Building2,
};

interface ErrorNotificationVisualProps {
  variant: ErrorNotificationVisualVariant;
}

export default function ErrorNotificationVisual({ variant }: ErrorNotificationVisualProps) {
  const Icon = ICON_BY_VARIANT[variant];

  return (
    <div className="notifications-panel__error-visual">
      <div className="notifications-panel__error-visual-icon-wrap">
        <Icon size={28} strokeWidth={1.85} aria-hidden />
        <span className="notifications-panel__error-visual-warning" aria-hidden>
          <AlertCircle size={14} strokeWidth={2.25} />
        </span>
      </div>
    </div>
  );
}
