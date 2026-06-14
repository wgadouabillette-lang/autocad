export type VoiceAssistTab = "ai-notes" | "follow-up";

export type ChatPanelMode =
  | "agent"
  | "friends"
  | "calendar"
  | "theater"
  | VoiceAssistTab;

export function isVoiceAssistPanelMode(mode: ChatPanelMode): boolean {
  return mode === "ai-notes" || mode === "follow-up";
}
