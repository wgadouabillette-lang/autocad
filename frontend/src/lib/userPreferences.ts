import type { SelectableWorkMode } from "./workModes";
import type { SubscriptionPlan } from "./subscriptionPlans";

const KEY = "forma-user-preferences";

export type SidePanelSide = "left" | "right";

export interface UserPreferences {
  chatWorkMode: SelectableWorkMode;
  autoWorkModeSwitch: boolean;
  userDisplayName: string;
  userEmail: string;
  photoURL?: string;
  recordingCameraPreview: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  audioEchoCancellation: boolean;
  audioNoiseSuppression: boolean;
  chatPanelOpen: boolean;
  sidePanelSide: SidePanelSide;
  subscriptionPlan: SubscriptionPlan;
  onDemandUsageEnabled: boolean;
  gameModeEnabled: boolean;
}

const DEFAULTS: UserPreferences = {
  chatWorkMode: "agent",
  autoWorkModeSwitch: false,
  userDisplayName: "William",
  userEmail: "william@forma.app",
  recordingCameraPreview: false,
  audioInputDeviceId: "",
  audioOutputDeviceId: "",
  audioEchoCancellation: true,
  audioNoiseSuppression: true,
  chatPanelOpen: true,
  sidePanelSide: "right",
  subscriptionPlan: "free",
  onDemandUsageEnabled: false,
  gameModeEnabled: false,
};

export function readUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<UserPreferences>;
    const chatWorkMode = data.chatWorkMode === "render" ? "render" : "agent";
    return {
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
      audioInputDeviceId:
        typeof data.audioInputDeviceId === "string" ? data.audioInputDeviceId : "",
      audioOutputDeviceId:
        typeof data.audioOutputDeviceId === "string" ? data.audioOutputDeviceId : "",
      audioEchoCancellation: data.audioEchoCancellation !== false,
      audioNoiseSuppression: data.audioNoiseSuppression !== false,
      chatPanelOpen: data.chatPanelOpen !== false,
      sidePanelSide: data.sidePanelSide === "left" ? "left" : "right",
      subscriptionPlan: data.subscriptionPlan === "pro" ? "pro" : "free",
      onDemandUsageEnabled:
        data.subscriptionPlan === "pro" && Boolean(data.onDemandUsageEnabled),
      gameModeEnabled: Boolean(data.gameModeEnabled),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUserPreferences(prefs: UserPreferences) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
