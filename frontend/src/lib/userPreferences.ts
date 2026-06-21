import type { SelectableWorkMode } from "./workModes";
import type { SubscriptionPlan } from "./subscriptionPlans";

import type { ColorThemePreference } from "./theme";

const KEY = "forma-user-preferences";

export type SidePanelSide = "left" | "right";

export function normalizeSidePanelSide(value: unknown): SidePanelSide {
  return value === "left" ? "left" : "right";
}

export type { ColorThemePreference };

export const DEFAULT_CALENDAR_WORK_START_MINUTES = 7 * 60;
export const DEFAULT_CALENDAR_WORK_END_MINUTES = 17 * 60;
export const MIN_CALENDAR_WORK_SPAN_MINUTES = 60;

export interface CalendarWorkingHours {
  startMinutes: number;
  endMinutes: number;
}

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
  // Toggle dev local — pas de paiement Stripe pour le moment.
  // Optionnels : non envoyés à Firestore (les rules ne laissent passer que le webhook Admin).
  // Quand Stripe sera réintroduit, ces champs seront pilotés par le webhook (billingManaged).
  subscriptionPlan?: SubscriptionPlan;
  billingManaged?: boolean;
  onDemandUsageEnabled?: boolean;
  agentChatInstructions: string;
  agentFollowUpInstructions: string;
  agentAiNotesInstructions: string;
  /** Minutes from midnight — default working-day start for calendar + /manage. */
  calendarWorkStartMinutes: number;
  /** Minutes from midnight — default working-day end for calendar + /manage. */
  calendarWorkEndMinutes: number;
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
  billingManaged: false,
  onDemandUsageEnabled: false,
  agentChatInstructions: "",
  agentFollowUpInstructions: "",
  agentAiNotesInstructions: "",
  calendarWorkStartMinutes: DEFAULT_CALENDAR_WORK_START_MINUTES,
  calendarWorkEndMinutes: DEFAULT_CALENDAR_WORK_END_MINUTES,
};

function clampMinutes(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeCalendarWorkStartMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CALENDAR_WORK_START_MINUTES;
  }
  return clampMinutes(value, 0, 23 * 60 + 59);
}

export function normalizeCalendarWorkEndMinutes(
  value: unknown,
  startMinutes: number,
): number {
  const minEnd = startMinutes + MIN_CALENDAR_WORK_SPAN_MINUTES;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return Math.max(DEFAULT_CALENDAR_WORK_END_MINUTES, minEnd);
  }
  return clampMinutes(value, minEnd, 24 * 60);
}

export function resolveCalendarWorkingHours(
  startMinutes?: unknown,
  endMinutes?: unknown,
): CalendarWorkingHours {
  const start = normalizeCalendarWorkStartMinutes(startMinutes);
  const end = normalizeCalendarWorkEndMinutes(endMinutes, start);
  return { startMinutes: start, endMinutes: end };
}

export function formatCalendarWorkTime(minutes: number): string {
  const safe = clampMinutes(minutes, 0, 24 * 60);
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function parseCalendarWorkTimeInput(value: string, fallback: number): number {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || mins >= 60) return fallback;
  return hours * 60 + mins;
}

export function readUserPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as Partial<UserPreferences>;
    const chatWorkMode = data.chatWorkMode === "render" ? "render" : "agent";
    const calendarHours = resolveCalendarWorkingHours(
      data.calendarWorkStartMinutes,
      data.calendarWorkEndMinutes,
    );
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
      // Toggle dev local — Stripe est désactivé, on pilote le plan via le store.
      subscriptionPlan: data.subscriptionPlan === "pro" ? "pro" : "free",
      billingManaged: data.billingManaged === true,
      onDemandUsageEnabled: data.onDemandUsageEnabled === true,
      agentChatInstructions:
        typeof data.agentChatInstructions === "string" ? data.agentChatInstructions : "",
      agentFollowUpInstructions:
        typeof data.agentFollowUpInstructions === "string" ? data.agentFollowUpInstructions : "",
      agentAiNotesInstructions:
        typeof data.agentAiNotesInstructions === "string" ? data.agentAiNotesInstructions : "",
      calendarWorkStartMinutes: calendarHours.startMinutes,
      calendarWorkEndMinutes: calendarHours.endMinutes,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeUserPreferences(prefs: UserPreferences) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}
