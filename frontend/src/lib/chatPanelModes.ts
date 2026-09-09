import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  ListTodo,
  MessageSquare,
  Sparkles,
  Theater,
  Users,
} from "lucide-react";
import type { SubscriptionPlan } from "./subscriptionPlans";
import { hasFollowUpAccess } from "./subscriptionPlans";
import type { ChatPanelMode } from "./voiceAssistPanel";

export interface ChatPanelModeTab {
  id: ChatPanelMode;
  /** i18n key under `chat.modes.*` */
  labelKey: string;
  icon: LucideIcon;
}

export function chatPanelModeTabs(
  plan: SubscriptionPlan,
  inTheaterView: boolean,
  billingManaged = false,
  workspaceEnterprise = false,
): ChatPanelModeTab[] {
  const tabs: ChatPanelModeTab[] = [
    { id: "agent", labelKey: "chat.modes.agent", icon: MessageSquare },
    { id: "calendar", labelKey: "chat.modes.calendar", icon: Calendar },
    { id: "friends", labelKey: "chat.modes.messages", icon: Users },
    { id: "ai-notes", labelKey: "chat.modes.notes", icon: Sparkles },
  ];

  if (hasFollowUpAccess(plan, billingManaged, workspaceEnterprise)) {
    tabs.push({ id: "follow-up", labelKey: "chat.modes.followUp", icon: ListTodo });
  }

  if (inTheaterView) {
    tabs.push({ id: "theater", labelKey: "chat.modes.theater", icon: Theater });
  }

  return tabs;
}
