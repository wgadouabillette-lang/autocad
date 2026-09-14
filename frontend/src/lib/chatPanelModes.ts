import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  MessageSquare,
  Sparkles,
  Theater,
  Users,
} from "lucide-react";
import type { SubscriptionPlan } from "./subscriptionPlans";
import type { ChatPanelMode } from "./voiceAssistPanel";

export interface ChatPanelModeTab {
  id: ChatPanelMode;
  /** i18n key under `chat.modes.*` */
  labelKey: string;
  icon: LucideIcon;
}

export function chatPanelModeTabs(
  _plan: SubscriptionPlan,
  inTheaterView: boolean,
  _billingManaged = false,
  _workspaceEnterprise = false,
): ChatPanelModeTab[] {
  const tabs: ChatPanelModeTab[] = [
    { id: "agent", labelKey: "chat.modes.agent", icon: MessageSquare },
    { id: "calendar", labelKey: "chat.modes.calendar", icon: Calendar },
    { id: "friends", labelKey: "chat.modes.messages", icon: Users },
    { id: "ai-notes", labelKey: "chat.modes.notes", icon: Sparkles },
  ];

  if (inTheaterView) {
    tabs.push({ id: "theater", labelKey: "chat.modes.theater", icon: Theater });
  }

  return tabs;
}
