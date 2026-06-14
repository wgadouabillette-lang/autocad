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
import { hasAiNotesAccess, hasFollowUpAccess } from "./subscriptionPlans";
import type { ChatPanelMode } from "./voiceAssistPanel";

export interface ChatPanelModeTab {
  id: ChatPanelMode;
  label: string;
  icon: LucideIcon;
}

export function chatPanelModeTabs(
  plan: SubscriptionPlan,
  inTheaterView: boolean,
  hasUnreadPeopleMessages: boolean,
): ChatPanelModeTab[] {
  const chatTab: ChatPanelModeTab = { id: "agent", label: "Chat", icon: MessageSquare };
  const calendarTab: ChatPanelModeTab = {
    id: "calendar",
    label: "Calendrier",
    icon: Calendar,
  };
  const friendsTab: ChatPanelModeTab = { id: "friends", label: "Messages", icon: Users };

  const tabs: ChatPanelModeTab[] = [chatTab];

  if (hasUnreadPeopleMessages) {
    tabs.push(friendsTab);
  }

  tabs.push(calendarTab);

  if (!hasUnreadPeopleMessages) {
    tabs.push(friendsTab);
  }

  if (inTheaterView) {
    tabs.push({ id: "theater", label: "Théâtre", icon: Theater });
  }

  if (hasAiNotesAccess(plan)) {
    tabs.push({ id: "ai-notes", label: "AI Notes", icon: Sparkles });
  }

  if (hasFollowUpAccess(plan)) {
    tabs.push({ id: "follow-up", label: "Follow-up", icon: ListTodo });
  }

  return tabs;
}
