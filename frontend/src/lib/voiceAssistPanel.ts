export type VoiceAssistTab = "ai-notes";

export type ChatPanelMode =
  | "agent"
  | "friends"
  | "calendar"
  | "theater"
  | VoiceAssistTab;

export function isVoiceAssistPanelMode(mode: ChatPanelMode): boolean {
  return mode === "ai-notes";
}
