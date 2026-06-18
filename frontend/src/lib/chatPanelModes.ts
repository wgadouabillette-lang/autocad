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
  label: string;
  icon: LucideIcon;
}

export function chatPanelModeTabs(
  plan: SubscriptionPlan,
  inTheaterView: boolean,
  billingManaged = false,
  workspaceEnterprise = false,
): ChatPanelModeTab[] {
  const tabs: ChatPanelModeTab[] = [
    { id: "agent", label: "Chat", icon: MessageSquare },
    { id: "ai-notes", label: "Notes", icon: Sparkles },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "friends", label: "Messages", icon: Users },
  ];

  if (inTheaterView) {
    tabs.push({ id: "theater", label: "Theater", icon: Theater });
  }

  if (hasFollowUpAccess(plan, billingManaged, workspaceEnterprise)) {
    tabs.push({ id: "follow-up", label: "Follow-up", icon: ListTodo });
  }

  return tabs;
}
