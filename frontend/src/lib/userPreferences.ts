import type { SelectableWorkMode } from "./workModes";
import type { SubscriptionPlan } from "./subscriptionPlans";

import type { ColorThemePreference } from "./theme";

const KEY = "forma-user-preferences";

export type SidePanelSide = "left" | "right";

export function normalizeSidePanelSide(value: unknown): SidePanelSide {
  return value === "left" ? "left" : "right";
}

export type { ColorThemePreference };

export interface UserPreferences {
  colorTheme: ColorThemePreference;
  chatWorkMode: SelectableWorkMode;
  autoWorkModeSwitch: boolean;
  userDisplayName: string;
  userEmail: string;
  photoURL?: string;
  recordingCameraPreview: boolean;
  /** When true, flip preview horizontally to match natural left/right movement. */
  recordingCameraMirrorPreview: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  audioEchoCancellation: boolean;
  audioNoiseSuppression: boolean;
  chatPanelOpen: boolean;
  sidePanelSide: SidePanelSide;
  subscriptionPlan: SubscriptionPlan;
  onDemandUsageEnabled: boolean;
  agentChatInstructions: string;
  agentFollowUpInstructions: string;
  agentAiNotesInstructions: string;
}

const DEFAULTS: UserPreferences = {
  colorTheme: "dark",
  chatWorkMode: "agent",
  autoWorkModeSwitch: false,
  userDisplayName: "William",
  userEmail: "william@forma.app",
  recordingCameraPreview: false,
  recordingCameraMirrorPreview: true,
  audioInputDeviceId: "",
  audioOutputDeviceId: "",
  audioEchoCancellation: true,
  audioNoiseSuppression: true,
  chatPanelOpen: true,
  sidePanelSide: "right",
  subscriptionPlan: "free",
  onDemandUsageEnabled: false,
  agentChatInstructions: "",
  agentFollowUpInstructions: "",
  agentAiNotesInstructions: "",
};

export function readUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<UserPreferences>;
    const chatWorkMode = data.chatWorkMode === "render" ? "render" : "agent";
    return {
      colorTheme:
        data.colorTheme === "light" || data.colorTheme === "system"
          ? data.colorTheme
          : "dark",
      chatWorkMode,
      autoWorkModeSwitch: Boolean(data.autoWorkModeSwitch),
      userDisplayName:
        typeof data.userDisplayName === "string" && data.userDisplayName.trim()
          ? data.userDisplayName.trim()
          : DEFAULTS.userDisplayName,
      userEmail:
        typeof data.userEmail === "string" && data.userEmail.trim()
          ? data.userEmail.trim()
          : DEFAULTS.userEmail,
      photoURL: typeof data.photoURL === "string" && data.photoURL.trim() ? data.photoURL.trim() : undefined,
      recordingCameraPreview: Boolean(data.recordingCameraPreview),
      recordingCameraMirrorPreview:
        data.recordingCameraMirrorPreview !== false,
      audioInputDeviceId:
        typeof data.audioInputDeviceId === "string" ? data.audioInputDeviceId : "",
      audioOutputDeviceId:
        typeof data.audioOutputDeviceId === "string" ? data.audioOutputDeviceId : "",
      audioEchoCancellation: data.audioEchoCancellation !== false,
      audioNoiseSuppression: data.audioNoiseSuppression !== false,
      chatPanelOpen: data.chatPanelOpen !== false,
      sidePanelSide: normalizeSidePanelSide(data.sidePanelSide),
      // Forfait : toujours gratuit en local — seul Firestore + billingManaged (webhook) active Pro.
      subscriptionPlan: "free",
      onDemandUsageEnabled: false,
      agentChatInstructions:
        typeof data.agentChatInstructions === "string" ? data.agentChatInstructions : "",
      agentFollowUpInstructions:
        typeof data.agentFollowUpInstructions === "string" ? data.agentFollowUpInstructions : "",
      agentAiNotesInstructions:
        typeof data.agentAiNotesInstructions === "string" ? data.agentAiNotesInstructions : "",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUserPreferences(prefs: UserPreferences) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      ...prefs,
      subscriptionPlan: "free",
      onDemandUsageEnabled: false,
    }),
  );
}
