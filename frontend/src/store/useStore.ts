import { create } from "zustand";
import { api } from "../lib/api";
import type {
  AgentResponse,
  CadDocument,
  Feature,
  ImportResponse,
  RebuildResult,
  VisionReport,
} from "../lib/types";
import type { DrawingDocument } from "../lib/drawing/types";
import { EMPTY_DRAWING } from "../lib/drawing/types";
import { useDrawingStore } from "./useDrawingStore";
import type { AiModel } from "../lib/aiModels";
import { handleAiModelFallback } from "../lib/aiQuota";
import type { AiRun, AiRunExpand } from "../lib/aiRun";
import { beginAiRequest, cancelAiRequest, endAiRequest } from "../lib/aiRequest";
import { AI_STUB_INFINITE_LOADING, waitUntilAborted } from "../lib/aiMock";
import { activeStepLabel, advanceRunSteps, createRunningRun, summarizeActions } from "../lib/aiRun";
import { stepTickIntervalMs } from "../lib/aiRunSteps";
import {
  effectiveWorkMode,
  type SelectableWorkMode,
  type WorkMode,
} from "../lib/workModes";
import {
  readUserPreferences,
  writeUserPreferences,
  type SidePanelSide,
  type UserPreferences,
} from "../lib/userPreferences";
import type { SubscriptionPlan } from "../lib/subscriptionPlans";
import type { AnySettingsTab, SettingsTab } from "../lib/settingsSearchSuggestions";
import { normalizeSettingsTab } from "../lib/settingsSearchSuggestions";
import { sameFaceReference, type FaceReference } from "../lib/faceReference";
import { sortOpenPages, type MainPageId } from "../lib/mainPages";
import { normalizeWorkspaceId } from "../lib/workspaces";
import { debugLog } from "../lib/debugLog";
import type { ChatSessionKind } from "../lib/chatSessionKinds";
import {
  augmentPromptWithRecipients,
  dispatchMessagesToMentionedPeople,
  mentionablePeopleForWorkspace,
  parsePeopleMentionsFromText,
  stripDispatchBlock,
} from "../lib/promptPeopleMentions";
import { useCallsStore } from "./useCallsStore";
import { useCasinoStore } from "./useCasinoStore";
import { usePeopleStore } from "./usePeopleStore";
import { isBackendUnavailableError, localRulesReply } from "../lib/chatRulesFallback";
import { waitMinChatProcessing } from "../lib/chatProcessing";
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  text: string;
  source?: string;
  actions?: { kind: string; description: string }[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  kind?: ChatSessionKind;
  recordingId?: string;
  durationMs?: number;
}

function chatTabTitle(messages: ChatMessage[]): string {
  const visible = messages.filter((m) => m.role !== "system");
  if (visible.length === 0) return "New";
  const firstUser = visible.find((m) => m.role === "user");
  const raw = firstUser?.text || "Conversation";
  const title = raw.slice(0, 32);
  return title.length < raw.length ? `${title}…` : title;
}

function createEmptyChatTab(kind: ChatSessionKind = "discussion"): ChatSession {
  return {
    id: `chat-${Date.now()}`,
    title: "New",
    messages: [],
    updatedAt: Date.now(),
    kind,
  };
}

export function updateActiveTabInTabs(
  tabs: ChatSession[],
  activeId: string,
  messages: ChatMessage[],
): ChatSession[] {
  return tabs.map((t) =>
    t.id === activeId
      ? {
          ...t,
          messages: structuredClone(messages),
          title: chatTabTitle(messages),
          updatedAt: Date.now(),
        }
      : t,
  );
}

function patchChatState(
  chat: ChatMessage[],
  tabs: ChatSession[],
  activeId: string,
): { chat: ChatMessage[]; openChatTabs: ChatSession[] } {
  return { chat, openChatTabs: updateActiveTabInTabs(tabs, activeId, chat) };
}

function initialOpenChatTabs(): {
  openChatTabs: ChatSession[];
  activeChatTabId: string;
  chatNavStack: string[];
  chatNavPointer: number;
} {
  const tab = createEmptyChatTab();
  return {
    openChatTabs: [tab],
    activeChatTabId: tab.id,
    chatNavStack: [tab.id],
    chatNavPointer: 0,
  };
}

function resolveOpenChatTabs(data: {
  chat?: ChatMessage[];
  openChatTabs?: ChatSession[];
  activeChatTabId?: string;
  chatNavStack?: string[];
  chatNavPointer?: number;
}): {
  openChatTabs: ChatSession[];
  activeChatTabId: string;
  chatNavStack: string[];
  chatNavPointer: number;
  chat: ChatMessage[];
} {
  if (data.openChatTabs?.length) {
    const activeId =
      data.activeChatTabId && data.openChatTabs.some((t) => t.id === data.activeChatTabId)
        ? data.activeChatTabId
        : data.openChatTabs[0].id;
    const active = data.openChatTabs.find((t) => t.id === activeId)!;
    const stack = data.chatNavStack?.length ? data.chatNavStack : [activeId];
    let pointer =
      typeof data.chatNavPointer === "number" ? data.chatNavPointer : stack.length - 1;
    pointer = Math.max(0, Math.min(pointer, stack.length - 1));
    return {
      openChatTabs: data.openChatTabs,
      activeChatTabId: activeId,
      chatNavStack: stack,
      chatNavPointer: pointer,
      chat: structuredClone(active.messages),
    };
  }
  const chat = data.chat || [];
  const tab: ChatSession = {
    id: `chat-${Date.now()}`,
    title: chatTabTitle(chat),
    messages: structuredClone(chat),
    updatedAt: Date.now(),
  };
  return {
    openChatTabs: [tab],
    activeChatTabId: tab.id,
    chatNavStack: [tab.id],
    chatNavPointer: 0,
    chat,
  };
}


export interface AutosavePayload {
  document: CadDocument;
  drawing: DrawingDocument;
  material: string;
  chat: ChatMessage[];
  openChatTabs?: ChatSession[];
  activeChatTabId?: string;
  chatNavStack?: string[];
  chatNavPointer?: number;
  chatSessions: ChatSession[];
  visionPreview: string | null;
  importReport: VisionReport | null;
  savedAt: number;
}

interface State {
  document: CadDocument;
  rebuild: RebuildResult | null;
  material: string;
  selectedFeatureId: string | null;
  selectedFaces: FaceReference[];
  busy: boolean;
  llmEnabled: boolean;
  chat: ChatMessage[];
  visionPreview: string | null;
  importReport: VisionReport | null;
  history: CadDocument[];
  historyIndex: number;
  historySkip: boolean;
  chatPanelOpen: boolean;
  chatPanelExpanded: boolean;
  /** True while the collapse-from-fullscreen CSS animation is running. */
  chatPanelLeaveAnimating: boolean;
  activeRoomId: string;
  /** Nombre de requêtes IA en cours (>1 → affichage Multitask mauve). */
  activeAiRequests: number;
  chatSessions: ChatSession[];
  openChatTabs: ChatSession[];
  activeChatTabId: string;
  /** Historique de navigation entre onglets (style navigateur). */
  chatNavStack: string[];
  chatNavPointer: number;
  showChatHistory: boolean;
  chatPanelMode: "agent" | "friends" | "calendar" | "theater" | "ai-notes" | "follow-up";
  pendingAutosave: AutosavePayload | null;
  autosaveChecked: boolean;
  aiModel: AiModel;
  chatWorkMode: SelectableWorkMode;
  autoWorkModeSwitch: boolean;
  userDisplayName: string;
  userEmail: string;
  photoURL: string | null;
  recordingCameraPreview: boolean;
  audioInputDeviceId: string;
  audioOutputDeviceId: string;
  audioEchoCancellation: boolean;
  audioNoiseSuppression: boolean;
  sidePanelSide: SidePanelSide;
  subscriptionPlan: SubscriptionPlan;
  onDemandUsageEnabled: boolean;
  gameModeEnabled: boolean;
  aiRun: AiRun | null;
  activePage: MainPageId | null;
  openPages: MainPageId[];
  settingsTab: SettingsTab;

  setMaterial: (m: string) => void;
  setAiModel: (model: AiModel) => void;
  setChatWorkMode: (mode: SelectableWorkMode) => void;
  setAutoWorkModeSwitch: (enabled: boolean) => void;
  setRecordingCameraPreview: (enabled: boolean) => void;
  setAudioInputDeviceId: (deviceId: string) => void;
  setAudioOutputDeviceId: (deviceId: string) => void;
  setAudioEchoCancellation: (enabled: boolean) => void;
  setAudioNoiseSuppression: (enabled: boolean) => void;
  setSidePanelSide: (side: SidePanelSide) => void;
  setUserDisplayName: (name: string) => void;
  setUserEmail: (email: string) => void;
  setPhotoURL: (url: string | null) => void;
  setSubscriptionPlan: (plan: SubscriptionPlan) => void;
  setOnDemandUsageEnabled: (enabled: boolean) => void;
  toggleOnDemandUsage: () => void;
  setGameModeEnabled: (enabled: boolean) => void;
  select: (id: string | null) => void;
  /** additive=true : ⌘/Ctrl+clic pour ajouter ou retirer une face de la sélection. */
  selectFace: (face: FaceReference, opts?: { additive?: boolean }) => void;
  clearSelectedFaces: () => void;
  newDocument: () => void;
  loadDocument: (doc: CadDocument, rb?: RebuildResult | null) => void;
  doRebuild: () => Promise<void>;
  updateFeatureParam: (id: string, key: string, value: number) => Promise<void>;
  toggleSuppress: (id: string) => Promise<void>;
  removeFeature: (id: string) => Promise<void>;
  applyImport: (res: ImportResponse) => void;
  importPartFile: (file: File) => Promise<void>;
  checkHealth: () => Promise<void>;
  recordHistory: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  quickSave: () => void;
  saveProject: () => void;
  newConversation: () => void;
  toggleChatPanel: () => void;
  closeChatPanel: () => void;
  toggleChatPanelExpanded: () => void;
  openAgentPanel: () => void;
  openAiNotesPanel: () => void;
  openFollowUpPanel: () => void;
  openCalendarPanel: () => void;
  openTheaterChatPanel: () => void;
  switchChatPanelMode: (
    mode: "agent" | "friends" | "calendar" | "theater" | "ai-notes" | "follow-up",
  ) => void;
  beginAiNotesSession: (workspaceId: string) => ChatSession;
  finalizeAiNotesSession: (input: {
    sessionId: string;
    messages: ChatMessage[];
    durationMs: number;
  }) => void;
  saveFollowUpNoteSession: (input: {
    recap: string;
    actions: { title: string; detail?: string; dueDate: string }[];
    emails: { to: string; subject: string; body: string }[];
    roomId: string;
  }) => void;
  setActiveRoom: (id: string) => void;
  startNewChat: () => void;
  switchChatTab: (id: string) => void;
  goBackChat: () => void;
  canGoBackChat: () => boolean;
  toggleChatHistory: () => void;
  setChatPanelMode: (
    mode: "agent" | "friends" | "calendar" | "theater" | "ai-notes" | "follow-up",
  ) => void;
  toggleFriendsChatMode: () => void;
  cycleChatPanelMode: () => void;
  openChatFromHistory: (id: string) => void;
  loadChatSession: (id: string) => void;
  saveRecordingSession: (input: {
    recordingId: string;
    durationMs: number;
    createdAt?: number;
  }) => ChatSession;
  checkAutosave: () => void;
  restoreAutosave: () => Promise<void>;
  dismissAutosave: () => void;
  addFeature: (feat: Feature) => Promise<void>;
  exportModel: (fmt: string) => Promise<void>;
  loadProjectFile: (file: File) => Promise<void>;
  loadExampleDocument: (doc: CadDocument) => Promise<void>;
  submitAssistantPrompt: (
    prompt: string,
    imageFiles?: File[],
  ) => Promise<{ blocked: boolean; requireImage?: boolean }>;
  sendChat: (prompt: string, userChatText?: string) => Promise<void>;
  sendAgent: (
    prompt: string,
    imageFiles?: File[],
    userChatText?: string,
    workModeOverride?: WorkMode,
    switchedFromRender?: boolean,
    switchedToRender?: boolean,
  ) => Promise<void>;
  generate: (
    prompt: string,
    imageFiles?: File[],
    userChatText?: string,
    workModeOverride?: WorkMode,
  ) => Promise<void>;
  resetProject: () => Promise<void>;
  setAiRunExpand: (expand: AiRunExpand) => void;
  toggleAiRunExpand: () => void;
  dismissAiRun: () => void;
  tickAiRunStep: () => void;
  stopAiRequest: () => string | null;
  setActivePage: (page: MainPageId) => void;
  openPage: (page: MainPageId) => void;
  closePage: (page: MainPageId) => void;
  openSettingsPage: () => void;
  setSettingsTab: (tab: AnySettingsTab) => void;
  openSettingsTab: (tab: AnySettingsTab) => void;
}

function chatWithoutLastUserPrompt(chat: ChatMessage[], prompt: string): ChatMessage[] {
  const last = chat[chat.length - 1];
  if (last?.role === "user" && last.text === prompt) {
    return chat.slice(0, -1);
  }
  return chat;
}

const EMPTY: CadDocument = {
  name: "Untitled",
  units: "mm",
  features: [],
  meta: {},
};

const AUTOSAVE_KEY = "forma-autosave";

const bootUserPreferences = readUserPreferences();

function userPreferencesSnapshot(state: {
  chatWorkMode: SelectableWorkMode;
  autoWorkModeSwitch: boolean;
  userDisplayName: string;
  userEmail: string;
  photoURL: string | null;
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
}): UserPreferences {
  return {
    chatWorkMode: state.chatWorkMode,
    autoWorkModeSwitch: state.autoWorkModeSwitch,
    userDisplayName: state.userDisplayName,
    userEmail: state.userEmail,
    photoURL: state.photoURL ?? undefined,
    recordingCameraPreview: state.recordingCameraPreview,
    audioInputDeviceId: state.audioInputDeviceId,
    audioOutputDeviceId: state.audioOutputDeviceId,
    audioEchoCancellation: state.audioEchoCancellation,
    audioNoiseSuppression: state.audioNoiseSuppression,
    chatPanelOpen: state.chatPanelOpen,
    sidePanelSide: state.sidePanelSide,
    subscriptionPlan: state.subscriptionPlan,
    onDemandUsageEnabled:
      state.subscriptionPlan === "pro" ? state.onDemandUsageEnabled : false,
    gameModeEnabled: state.gameModeEnabled,
  };
}

function readAutosave(): AutosavePayload | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AutosavePayload;
    if (!data.document || !data.savedAt) return null;
    return data;
  } catch {
    return null;
  }
}

function writeAutosave(state: State) {
  const drawing = useDrawingStore.getState().getDrawingSnapshot();
  const payload: AutosavePayload = {
    document: state.document,
    drawing,
    material: state.material,
    chat: state.chat,
    openChatTabs: state.openChatTabs,
    activeChatTabId: state.activeChatTabId,
    chatNavStack: state.chatNavStack,
    chatNavPointer: state.chatNavPointer,
    chatSessions: state.chatSessions,
    visionPreview: state.visionPreview,
    importReport: state.importReport,
    savedAt: Date.now(),
  };
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
}

export const useStore = create<State>((set, get) => ({
  document: EMPTY,
  rebuild: null,
  material: "aluminium",
  selectedFeatureId: null,
  selectedFaces: [],
  busy: false,
  llmEnabled: false,
  chat: [],
  visionPreview: null,
  importReport: null,
  history: [structuredClone(EMPTY)],
  historyIndex: 0,
  historySkip: false,
  activeAiRequests: 0,
  activeRoomId: "forma",
  chatSessions: [],
  ...initialOpenChatTabs(),
  showChatHistory: false,
  chatPanelMode: "agent",
  pendingAutosave: null,
  autosaveChecked: false,
  aiModel: "auto",
  ...bootUserPreferences,
  photoURL: bootUserPreferences.photoURL ?? null,
  chatPanelExpanded: false,
  chatPanelLeaveAnimating: false,
  aiRun: null,
  activePage: null,
  openPages: [],
  settingsTab: "general",

  setMaterial: (m) => {
    set({ material: m });
    void get().doRebuild();
  },

  setAiModel: (model) => set({ aiModel: model }),

  setChatWorkMode: (mode) => {
    set({ chatWorkMode: mode });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), chatWorkMode: mode }));
  },

  setAutoWorkModeSwitch: (enabled) => {
    set({ autoWorkModeSwitch: enabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), autoWorkModeSwitch: enabled }));
  },

  setRecordingCameraPreview: (enabled) => {
    set({ recordingCameraPreview: enabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), recordingCameraPreview: enabled }));
  },

  setAudioInputDeviceId: (deviceId) => {
    set({ audioInputDeviceId: deviceId });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), audioInputDeviceId: deviceId }));
  },

  setAudioOutputDeviceId: (deviceId) => {
    set({ audioOutputDeviceId: deviceId });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), audioOutputDeviceId: deviceId }));
  },

  setAudioEchoCancellation: (enabled) => {
    set({ audioEchoCancellation: enabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), audioEchoCancellation: enabled }));
  },

  setAudioNoiseSuppression: (enabled) => {
    set({ audioNoiseSuppression: enabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), audioNoiseSuppression: enabled }));
  },

  setSidePanelSide: (side) => {
    set({ sidePanelSide: side });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), sidePanelSide: side }));
  },

  setUserDisplayName: (name) => {
    const trimmed = name.trim() || bootUserPreferences.userDisplayName;
    set({ userDisplayName: trimmed });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), userDisplayName: trimmed }));
  },

  setUserEmail: (email) => {
    const trimmed = email.trim() || bootUserPreferences.userEmail;
    set({ userEmail: trimmed });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), userEmail: trimmed }));
  },

  setPhotoURL: (url) => {
    const photoURL = url?.trim() || null;
    set({ photoURL });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), photoURL }));
  },

  setSubscriptionPlan: (plan) => {
    const onDemandUsageEnabled = plan === "pro" ? get().onDemandUsageEnabled : false;
    set({ subscriptionPlan: plan, onDemandUsageEnabled });
    writeUserPreferences(
      userPreferencesSnapshot({ ...get(), subscriptionPlan: plan, onDemandUsageEnabled }),
    );
  },

  setOnDemandUsageEnabled: (enabled) => {
    if (get().subscriptionPlan !== "pro") return;
    set({ onDemandUsageEnabled: enabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), onDemandUsageEnabled: enabled }));
  },

  toggleOnDemandUsage: () => {
    if (get().subscriptionPlan !== "pro") return;
    const onDemandUsageEnabled = !get().onDemandUsageEnabled;
    set({ onDemandUsageEnabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), onDemandUsageEnabled }));
  },

  setGameModeEnabled: (enabled) => {
    set({ gameModeEnabled: enabled });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), gameModeEnabled: enabled }));
    if (!enabled) useCasinoStore.getState().closeRoulette();
  },

  select: (id) => set({ selectedFeatureId: id }),

  selectFace: (face, opts) => {
    const additive = opts?.additive ?? false;
    const { selectedFaces } = get();
    const idx = selectedFaces.findIndex((f) => sameFaceReference(f, face));
    if (additive) {
      if (idx >= 0) {
        set({ selectedFaces: selectedFaces.filter((_, i) => i !== idx) });
      } else {
        set({ selectedFaces: [...selectedFaces, face] });
      }
      return;
    }
    if (idx >= 0 && selectedFaces.length === 1) {
      set({ selectedFaces: [] });
    } else {
      set({ selectedFaces: [face] });
    }
  },

  clearSelectedFaces: () => set({ selectedFaces: [] }),

  newDocument: () => {
    set({
      document: { ...EMPTY, features: [] },
      rebuild: null,
      selectedFeatureId: null,
      selectedFaces: [],
      history: [structuredClone(EMPTY)],
      historyIndex: 0,
    });
  },

  resetProject: async () => {
    set({
      document: { ...EMPTY, features: [] },
      rebuild: null,
      selectedFeatureId: null,
      selectedFaces: [],
      chat: [],
      chatSessions: [],
      ...initialOpenChatTabs(),
      visionPreview: null,
      importReport: null,
      history: [structuredClone({ ...EMPTY, features: [] })],
      historyIndex: 0,
      pendingAutosave: null,
      aiRun: null,
    });
    useDrawingStore.getState().resetDrawing();
    localStorage.removeItem(AUTOSAVE_KEY);
    await get().doRebuild();
  },

  loadDocument: (doc, rb = null) => {
    set({ document: doc, rebuild: rb, selectedFeatureId: null, selectedFaces: [] });
    get().recordHistory();
  },

  doRebuild: async () => {
    const { document, material } = get();
    set({ busy: true });
    try {
      const rb = await api.rebuild(document, material);
      set({ rebuild: rb });
    } finally {
      set({ busy: false });
    }
  },

  updateFeatureParam: async (id, key, value) => {
    const doc = structuredClone(get().document);
    const f = doc.features.find((x) => x.id === id);
    if (!f) return;
    f.params[key] = value;
    set({ document: doc });
    await get().doRebuild();
    get().recordHistory();
    writeAutosave(get());
  },

  toggleSuppress: async (id) => {
    const doc = structuredClone(get().document);
    const f = doc.features.find((x) => x.id === id);
    if (!f) return;
    f.suppressed = !f.suppressed;
    set({ document: doc });
    await get().doRebuild();
    get().recordHistory();
    writeAutosave(get());
  },

  removeFeature: async (id) => {
    const doc = structuredClone(get().document);
    doc.features = doc.features.filter((x) => x.id !== id);
    set({ document: doc, selectedFeatureId: null });
    await get().doRebuild();
    get().recordHistory();
    writeAutosave(get());
  },

  addFeature: async (feat) => {
    const doc = structuredClone(get().document);
    doc.features.push(feat);
    set({ document: doc, selectedFeatureId: feat.id });
    await get().doRebuild();
    get().recordHistory();
    writeAutosave(get());
  },

  setAiRunExpand: (expand) => {
    const run = get().aiRun;
    if (!run) return;
    set({ aiRun: { ...run, expand } });
  },

  toggleAiRunExpand: () => {
    const run = get().aiRun;
    if (!run) return;
    set({ aiRun: { ...run, expand: run.expand === "full" ? "peek" : "full" } });
  },

  dismissAiRun: () => set({ aiRun: null }),

  tickAiRunStep: () => {
    const run = get().aiRun;
    if (!run || run.status !== "running") return;
    const steps = advanceRunSteps(run.steps);
    const next = { ...run, steps };
    set({ aiRun: { ...next, summary: activeStepLabel(next) } });
  },

  stopAiRequest: () => {
    const run = get().aiRun;
    if (!run || run.status !== "running") return null;
    const prompt = run.prompt;
    cancelAiRequest();
    set((s) => ({
      aiRun: null,
      busy: false,
      activeAiRequests: 0,
      ...patchChatState(
        chatWithoutLastUserPrompt(s.chat, prompt),
        s.openChatTabs,
        s.activeChatTabId,
      ),
    }));
    return prompt;
  },

  submitAssistantPrompt: async (prompt, _imageFiles = []) => {
    const trimmed = prompt.trim();
    const userChatText = trimmed || "(Attachments)";
    await get().sendChat(trimmed, userChatText);
    writeAutosave(get());
    return { blocked: false as const };
  },

  sendChat: async (prompt, userChatText) => {
    const displayText = userChatText ?? prompt;

    const { aiModel, chat, activeRoomId } = get();
    const peopleState = usePeopleStore.getState();
    const roomCalls = useCallsStore.getState().getRoomCalls(activeRoomId);
    const mentionable = mentionablePeopleForWorkspace(
      activeRoomId,
      peopleState.friends,
      peopleState.colleagueThreadsForWorkspace(activeRoomId),
      roomCalls.blocks.flatMap((block) => block.participants),
    );
    const mentions = parsePeopleMentionsFromText(displayText, mentionable);
    const apiPrompt = augmentPromptWithRecipients(prompt, mentions);

    set((s) => ({ activeAiRequests: s.activeAiRequests + 1 }));
    const run = createRunningRun(displayText, "agent", aiModel, false, "chat");
    const signal = beginAiRequest(run.id);
    set((s) => ({
      busy: true,
      aiRun: run,
      chatPanelOpen: true,
      ...patchChatState([...s.chat, { role: "user", text: displayText }], s.openChatTabs, s.activeChatTabId),
    }));
    const tickMs = stepTickIntervalMs("chat");
    const stepTimer = window.setInterval(() => get().tickAiRunStep(), tickMs);
    const processingStartedAt = Date.now();
    try {
      if (AI_STUB_INFINITE_LOADING) {
        await waitUntilAborted(signal);
        return;
      }
      const history = chatWithoutLastUserPrompt(get().chat, displayText)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.text }));
      get().tickAiRunStep();
      const res = await api.chat(apiPrompt, aiModel, history, signal);
      handleAiModelFallback(res, get().setAiModel);

      let assistantText = stripDispatchBlock(res.message) || res.message;
      if (mentions.length > 0) {
        dispatchMessagesToMentionedPeople({
          userPrompt: displayText,
          assistantMessage: res.message,
          mentions,
          workspaceId: activeRoomId,
          sendMessage: peopleState.sendMessage,
          ensureColleagueThread: peopleState.ensureColleagueThread,
        });
        const names = mentions.map((m) => m.person.name).join(", ");
        assistantText = `${assistantText}\n\n_Message envoyé à ${names}._`;
      }

      await waitMinChatProcessing(processingStartedAt, signal);

      const summary =
        assistantText.length > 140 ? `${assistantText.slice(0, 137)}…` : assistantText;
      set((s) => ({
        ...patchChatState(
          [
            ...s.chat,
            { role: "assistant", text: assistantText, source: res.source },
          ],
          s.openChatTabs,
          s.activeChatTabId,
        ),
        aiRun: {
          ...run,
          status: "done",
          finishedAt: Date.now(),
          summary,
          message: assistantText,
          source: res.source,
          steps: run.steps.map((step) => ({ ...step, status: "done" as const })),
        },
      }));
      writeAutosave(get());
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (get().aiRun?.id === run.id) {
          set({
            aiRun: {
              ...run,
              status: "cancelled",
              finishedAt: Date.now(),
              summary: "Stopped",
              steps: [{ id: "1", label: "Thinking…", status: "error" }],
            },
          });
        }
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      try {
        await waitMinChatProcessing(processingStartedAt, signal);
      } catch (waitErr: unknown) {
        if (waitErr instanceof DOMException && waitErr.name === "AbortError") {
          if (get().aiRun?.id === run.id) {
            set({
              aiRun: {
                ...run,
                status: "cancelled",
                finishedAt: Date.now(),
                summary: "Stopped",
                steps: [{ id: "1", label: "Processing…", status: "error" }],
              },
            });
          }
          return;
        }
      }
      if (isBackendUnavailableError(message)) {
        const assistantText = localRulesReply(displayText);
        set((s) => ({
          ...patchChatState(
            [...s.chat, { role: "assistant", text: assistantText, source: "rules" }],
            s.openChatTabs,
            s.activeChatTabId,
          ),
          aiRun: {
            ...run,
            status: "done",
            finishedAt: Date.now(),
            summary: assistantText.slice(0, 140),
            message: assistantText,
            source: "rules",
            steps: run.steps.map((step) => ({ ...step, status: "done" as const })),
          },
        }));
        writeAutosave(get());
      } else {
        set((s) => ({
          ...patchChatState(
            [...s.chat, { role: "assistant", text: "Error: " + message }],
            s.openChatTabs,
            s.activeChatTabId,
          ),
          aiRun: {
            ...run,
            status: "error",
            finishedAt: Date.now(),
            summary: message.slice(0, 140),
            error: message,
            steps: [{ id: "1", label: "Error", detail: message, status: "error" }],
          },
        }));
      }
    } finally {
      window.clearInterval(stepTimer);
      endAiRequest(run.id);
      set((s) => {
        const n = Math.max(0, s.activeAiRequests - 1);
        return { activeAiRequests: n, busy: n > 0 };
      });
    }
  },

  sendAgent: async (
    prompt,
    imageFiles = [],
    userChatText,
    workModeOverride,
    switchedFromRender,
    switchedToRender,
  ) => {
    const { document, material, aiModel, chatWorkMode, activeAiRequests } = get();
    const displayText = userChatText ?? prompt;
    const hasImages = imageFiles.length > 0;
    set((s) => ({ activeAiRequests: s.activeAiRequests + 1 }));
    const mode: WorkMode =
      workModeOverride ?? effectiveWorkMode(activeAiRequests + 1, chatWorkMode);
    const run = createRunningRun(displayText, mode, aiModel, hasImages);
    const signal = beginAiRequest(run.id);
    set((s) => ({
      busy: true,
      aiRun: run,
      chatPanelOpen: true,
      ...patchChatState([...s.chat, { role: "user", text: displayText }], s.openChatTabs, s.activeChatTabId),
    }));
    const tickMs = stepTickIntervalMs(run.runKind ?? "agent");
    const stepTimer = window.setInterval(() => get().tickAiRunStep(), tickMs);
    try {
      if (AI_STUB_INFINITE_LOADING) {
        await waitUntilAborted(signal);
        return;
      }
      const { filesToAgentImages, validateAgentImages } = await import("../lib/agentImages");
      const imgErr = hasImages ? await validateAgentImages(imageFiles) : null;
      if (imgErr) throw new Error(imgErr);
      get().tickAiRunStep();
      const images = await filesToAgentImages(imageFiles);
      get().tickAiRunStep();
      const res: AgentResponse = await api.agent(
        document,
        prompt,
        material,
        aiModel,
        mode,
        signal,
        images,
      );
      handleAiModelFallback(res, get().setAiModel);
      let assistantText = res.message;
      if (switchedFromRender) {
        assistantText =
          "_Automatically switched to Agent mode._\n\n" + assistantText;
      } else if (switchedToRender) {
        assistantText =
          "_Automatically switched to Render mode._\n\n" + assistantText;
      }
      const actions = res.actions.map((a) => ({ kind: a.kind, description: a.description }));
      const actionSteps = actions.map((a, i) => ({
        id: `act-${i}`,
        label: a.description,
        status: "done" as const,
      }));
      const doneSteps = [
        ...run.steps.map((s) => ({ ...s, status: "done" as const })),
        ...actionSteps,
      ];
      set((s) => ({
        document: res.document,
        rebuild: res.rebuild,
        ...patchChatState(
          [
            ...s.chat,
            {
              role: "assistant",
              text: assistantText,
              source: res.source,
              actions,
            },
          ],
          s.openChatTabs,
          s.activeChatTabId,
        ),
        aiRun: {
          ...run,
          status: "done",
          finishedAt: Date.now(),
          expand: run.expand,
          summary: summarizeActions(actions, res.message),
          message: res.message,
          actions,
          source: res.source,
          steps: doneSteps,
        },
      }));
      get().recordHistory();
      writeAutosave(get());
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (get().aiRun?.id === run.id) {
          set({
            aiRun: {
              ...run,
              status: "cancelled",
              finishedAt: Date.now(),
              summary: "Stopped",
              steps: [
                { id: "1", label: "Analyzing request", status: "done" },
                { id: "2", label: "Request cancelled", status: "error" },
              ],
            },
          });
        }
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      set((s) => ({
        ...patchChatState(
          [...s.chat, { role: "assistant", text: "Error: " + message }],
          s.openChatTabs,
          s.activeChatTabId,
        ),
        aiRun: {
          ...run,
          status: "error",
          finishedAt: Date.now(),
          summary: message.slice(0, 140),
          error: message,
          steps: [
            { id: "1", label: "Analyzing request", status: "done" },
            { id: "2", label: "Error", detail: message, status: "error" },
          ],
        },
      }));
    } finally {
      window.clearInterval(stepTimer);
      endAiRequest(run.id);
      set((s) => {
        const n = Math.max(0, s.activeAiRequests - 1);
        return { activeAiRequests: n, busy: n > 0 };
      });
    }
  },

  generate: async (prompt, imageFiles = [], userChatText, workModeOverride) => {
    const displayText = userChatText ?? prompt;
    if (imageFiles.length > 0) {
      const mode = workModeOverride ?? get().chatWorkMode;
      return get().sendAgent(prompt, imageFiles, displayText, mode);
    }

    const { material, aiModel, chatWorkMode, activeAiRequests } = get();
    set((s) => ({ activeAiRequests: s.activeAiRequests + 1 }));
    const mode: WorkMode =
      workModeOverride ?? effectiveWorkMode(activeAiRequests + 1, chatWorkMode);
    const run = createRunningRun(displayText, mode, aiModel, false, "generate");
    const signal = beginAiRequest(run.id);
    set((s) => ({
      busy: true,
      aiRun: run,
      chatPanelOpen: true,
      ...patchChatState([...s.chat, { role: "user", text: displayText }], s.openChatTabs, s.activeChatTabId),
    }));
    const tickMs = stepTickIntervalMs(run.runKind ?? "generate");
    const stepTimer = window.setInterval(() => get().tickAiRunStep(), tickMs);
    try {
      if (AI_STUB_INFINITE_LOADING) {
        await waitUntilAborted(signal);
        return;
      }
      get().tickAiRunStep();
      const res = await api.textToCad(prompt, material, aiModel, mode, signal);
      handleAiModelFallback(res, get().setAiModel);
      const actions = res.actions?.map((a) => ({ kind: a.kind, description: a.description })) ?? [];
      const actionSteps = actions.map((a, i) => ({
        id: `act-${i}`,
        label: a.description,
        status: "done" as const,
      }));
      set((s) => ({
        document: res.document,
        rebuild: res.rebuild,
        selectedFeatureId: null,
        ...patchChatState(
          [...s.chat, { role: "assistant", text: res.message, source: res.source }],
          s.openChatTabs,
          s.activeChatTabId,
        ),
        aiRun: {
          ...run,
          status: "done",
          finishedAt: Date.now(),
          summary: actions.length ? summarizeActions(actions, res.message) : "Model generated",
          message: res.message,
          actions,
          source: res.source,
          steps: [...run.steps.map((s) => ({ ...s, status: "done" as const })), ...actionSteps],
        },
      }));
      get().recordHistory();
      writeAutosave(get());
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        if (get().aiRun?.id === run.id) {
          set({
            aiRun: {
              ...run,
              status: "cancelled",
              finishedAt: Date.now(),
              summary: "Stopped",
              steps: [{ id: "1", label: "Request cancelled", status: "error" }],
            },
          });
        }
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      set((s) => ({
        ...patchChatState(
          [...s.chat, { role: "assistant", text: "Error: " + message }],
          s.openChatTabs,
          s.activeChatTabId,
        ),
        aiRun: {
          ...run,
          status: "error",
          finishedAt: Date.now(),
          summary: "Generation failed",
          error: message,
          steps: [{ id: "1", label: "Error", detail: message, status: "error" }],
        },
      }));
    } finally {
      window.clearInterval(stepTimer);
      endAiRequest(run.id);
      set((s) => {
        const n = Math.max(0, s.activeAiRequests - 1);
        return { activeAiRequests: n, busy: n > 0 };
      });
    }
  },

  applyImport: (res) => {
    set({
      document: res.document,
      rebuild: res.rebuild,
      visionPreview: res.report.preview_png_b64 || null,
      importReport: res.report,
      selectedFeatureId: null,
    });
    get().recordHistory();
    writeAutosave(get());
  },

  importPartFile: async (file) => {
    const { material } = get();
    const res = await api.importPartMesh(file, material);
    set({
      document: res.document,
      rebuild: res.rebuild,
      visionPreview: null,
      importReport: null,
      selectedFeatureId: res.document.features[0]?.id ?? null,
      selectedFaces: [],
      historySkip: true,
      history: [structuredClone(res.document)],
      historyIndex: 0,
    });
    set({ historySkip: false });
    get().recordHistory();
    writeAutosave(get());
  },

  checkHealth: async () => {
    try {
      const h = await api.health();
      set({ llmEnabled: !!h.llm });
    } catch {
      /* backend non démarré */
    }
  },

  recordHistory: () => {
    if (get().historySkip) return;
    const doc = structuredClone(get().document);
    let { history, historyIndex } = get();
    history = history.slice(0, historyIndex + 1);
    history.push(doc);
    if (history.length > 50) {
      history.shift();
    } else {
      historyIndex += 1;
    }
    set({ history, historyIndex });
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  undo: async () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const idx = historyIndex - 1;
    set({
      historySkip: true,
      historyIndex: idx,
      document: structuredClone(history[idx]),
      selectedFeatureId: null,
    });
    await get().doRebuild();
    set({ historySkip: false });
    writeAutosave(get());
  },

  redo: async () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const idx = historyIndex + 1;
    set({
      historySkip: true,
      historyIndex: idx,
      document: structuredClone(history[idx]),
      selectedFeatureId: null,
    });
    await get().doRebuild();
    set({ historySkip: false });
    writeAutosave(get());
  },

  quickSave: () => {
    writeAutosave(get());
  },

  saveProject: () => {
    const {
      document,
      material,
      chat,
      openChatTabs,
      activeChatTabId,
      chatNavStack,
      chatNavPointer,
      chatSessions,
      visionPreview,
      importReport,
    } = get();
    const drawing = useDrawingStore.getState().getDrawingSnapshot();
    const payload = {
      version: 2,
      document,
      drawing,
      material,
      chat,
      openChatTabs,
      activeChatTabId,
      chatNavStack,
      chatNavPointer,
      chatSessions,
      visionPreview,
      importReport,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.name || "projet"}.forma.json`;
    a.click();
    URL.revokeObjectURL(url);
    writeAutosave(get());
  },

  exportModel: async (fmt) => {
    const { document } = get();
    try {
      const blob = await api.export(document, fmt);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `${document.name || "model"}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Export failed: " + e.message);
    }
  },

  loadProjectFile: async (file) => {
    const text = await file.text();
    const data = JSON.parse(text) as {
      document: CadDocument;
      drawing?: DrawingDocument;
      material?: string;
      chat?: ChatMessage[];
      openChatTabs?: ChatSession[];
      activeChatTabId?: string;
      chatNavStack?: string[];
      chatNavPointer?: number;
      chatSessions?: ChatSession[];
      visionPreview?: string | null;
      importReport?: VisionReport | null;
    };
    if (!data.document) throw new Error("Invalid project file");
    const resolved = resolveOpenChatTabs(data);
    set({
      historySkip: true,
      document: data.document,
      material: data.material || get().material,
      ...resolved,
      chatSessions: data.chatSessions || [],
      visionPreview: data.visionPreview ?? null,
      importReport: data.importReport ?? null,
      selectedFeatureId: null,
      rebuild: null,
      history: [structuredClone(data.document)],
      historyIndex: 0,
    });
    useDrawingStore.getState().loadDrawing(data.drawing ?? structuredClone(EMPTY_DRAWING));
    await get().doRebuild();
    set({ historySkip: false });
    writeAutosave(get());
  },

  loadExampleDocument: async (doc) => {
    set({
      historySkip: true,
      document: doc,
      rebuild: null,
      selectedFeatureId: null,
      history: [structuredClone(doc)],
      historyIndex: 0,
    });
    await get().doRebuild();
    set({ historySkip: false });
    get().recordHistory();
    writeAutosave(get());
  },

  checkAutosave: () => {
    if (get().autosaveChecked) return;
    const data = readAutosave();
    set({ autosaveChecked: true });
    const hasDrawing = data?.drawing && data.drawing.entities.length > 0;
    if (data && (data.document.features.length > 0 || data.visionPreview || hasDrawing)) {
      set({ pendingAutosave: data });
    }
  },

  restoreAutosave: async () => {
    const data = get().pendingAutosave;
    if (!data) return;
    const resolved = resolveOpenChatTabs(data);
    set({
      historySkip: true,
      document: data.document,
      material: data.material,
      ...resolved,
      chatSessions: data.chatSessions || [],
      visionPreview: data.visionPreview ?? null,
      importReport: data.importReport ?? null,
      selectedFeatureId: null,
      rebuild: null,
      pendingAutosave: null,
      history: [structuredClone(data.document)],
      historyIndex: 0,
    });
    useDrawingStore.getState().loadDrawing(data.drawing ?? structuredClone(EMPTY_DRAWING));
    await get().doRebuild();
    set({ historySkip: false });
  },

  dismissAutosave: () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    set({ pendingAutosave: null });
  },

  newConversation: () => get().startNewChat(),

  closeChatPanel: () => {
    if (!get().chatPanelOpen) return;
    set({
      chatPanelOpen: false,
      chatPanelExpanded: false,
      chatPanelLeaveAnimating: false,
      showChatHistory: false,
      chatPanelMode: "agent",
    });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), chatPanelOpen: false }));
  },

  toggleChatPanelExpanded: () => {
    const state = get();
    if (!state.chatPanelOpen) {
      set({ chatPanelOpen: true, chatPanelExpanded: true });
      writeUserPreferences(userPreferencesSnapshot({ ...get(), chatPanelOpen: true }));
      return;
    }
    set({ chatPanelExpanded: !state.chatPanelExpanded });
  },

  switchChatPanelMode: (mode) => {
    set({
      chatPanelOpen: true,
      chatPanelMode: mode,
      showChatHistory: false,
      activePage: null,
      openPages: [],
    });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), chatPanelOpen: true }));
  },

  openAgentPanel: () => get().switchChatPanelMode("agent"),

  openAiNotesPanel: () => get().switchChatPanelMode("ai-notes"),

  openFollowUpPanel: () => get().switchChatPanelMode("follow-up"),

  beginAiNotesSession: (workspaceId) => {
    const at = Date.now();
    const id = `ainotes-${at}`;
    const title = `AI Notes · ${new Date(at).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const tab: ChatSession = {
      id,
      title,
      messages: [],
      updatedAt: at,
      kind: "note",
    };
    const { chat, openChatTabs, activeChatTabId } = get();
    const synced = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const stack = get().chatNavStack.slice(0, get().chatNavPointer + 1);
    stack.push(id);
    set({
      openChatTabs: [...synced, tab],
      activeChatTabId: id,
      chat: [],
      chatNavStack: stack,
      chatNavPointer: stack.length - 1,
      showChatHistory: false,
      chatPanelOpen: true,
      chatPanelMode: "ai-notes",
      activeRoomId: normalizeWorkspaceId(workspaceId),
    });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), chatPanelOpen: true }));
    return tab;
  },

  finalizeAiNotesSession: ({ sessionId, messages, durationMs }) => {
    set((s) => {
      const existing =
        s.openChatTabs.find((t) => t.id === sessionId) ??
        s.chatSessions.find((t) => t.id === sessionId);
      const session: ChatSession = {
        id: sessionId,
        title: existing?.title ?? "AI Notes",
        messages: structuredClone(messages),
        updatedAt: Date.now(),
        kind: "note",
        durationMs,
      };
      const openChatTabs = s.openChatTabs.some((t) => t.id === sessionId)
        ? s.openChatTabs.map((t) => (t.id === sessionId ? session : t))
        : [...s.openChatTabs, session];
      const chat =
        s.activeChatTabId === sessionId ? structuredClone(messages) : s.chat;
      const chatSessions = [session, ...s.chatSessions.filter((item) => item.id !== sessionId)];
      return { openChatTabs, chat, chatSessions };
    });
    writeAutosave(get());
  },

  saveFollowUpNoteSession: ({ recap, actions, emails, roomId }) => {
    const at = Date.now();
    const id = `followup-${at}`;
    const title = `Follow-up · ${new Date(at).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;

    const lines = [recap, "", "## Actions"];
    for (const action of actions) {
      lines.push(
        `- ${action.title}${action.detail ? ` (${action.detail})` : ""} — ${action.dueDate}`,
      );
    }
    if (emails.length > 0) {
      lines.push("", "## E-mails à envoyer");
      for (const email of emails) {
        lines.push(`- ${email.to} — ${email.subject}`);
        if (email.body.trim()) lines.push(`  ${email.body.trim()}`);
      }
    }

    const session: ChatSession = {
      id,
      title,
      messages: [{ role: "assistant", text: lines.join("\n") }],
      updatedAt: at,
      kind: "note",
    };

    set((s) => ({
      chatSessions: [session, ...s.chatSessions.filter((item) => item.id !== id)],
    }));
    writeAutosave(get());

    void roomId;
  },

  openCalendarPanel: () => get().switchChatPanelMode("calendar"),

  openTheaterChatPanel: () => get().switchChatPanelMode("theater"),

  toggleChatPanel: () => {
    const { chatPanelOpen, chatPanelMode } = get();
    if (!chatPanelOpen) {
      get().openAgentPanel();
      return;
    }
    if (
      chatPanelMode === "calendar" ||
      chatPanelMode === "theater" ||
      chatPanelMode === "ai-notes" ||
      chatPanelMode === "follow-up"
    ) {
      get().openAgentPanel();
      return;
    }
    get().closeChatPanel();
  },

  setActiveRoom: (id) => {
    const state = get();
    const workspaceId = normalizeWorkspaceId(id);
    // #region agent log
    debugLog(
      "useStore.ts:setActiveRoom",
      "setActiveRoom called",
      { workspaceId, previousActiveRoomId: state.activeRoomId },
      "D",
    );
    // #endregion
    if (state.activePage === "settings") {
      state.closePage("settings");
    }
    if (workspaceId !== state.activeRoomId) {
      useCallsStore.getState().closeTheaterView(state.activeRoomId);
    }
    useCallsStore.getState().ensureRoom(workspaceId);
    set({ activeRoomId: workspaceId });
  },

  setActivePage: (page) => {
    const { openPages } = get();
    if (!openPages.includes(page)) return;
    set({ activePage: page });
  },

  openPage: (page) =>
    set((s) => {
      const next = s.openPages.includes(page) ? s.openPages : [...s.openPages, page];
      return { openPages: sortOpenPages(next), activePage: page };
    }),

  closePage: (page) => {
    set((s) => {
      const openPages = sortOpenPages(s.openPages.filter((p) => p !== page));
      const activePage = s.activePage === page ? null : s.activePage;
      return { openPages, activePage };
    });
  },

  openSettingsPage: () => {
    const state = get();
    if (state.chatPanelExpanded || state.chatPanelLeaveAnimating) {
      set({
        chatPanelExpanded: false,
        chatPanelLeaveAnimating: false,
      });
    }
    if (state.activePage === "settings") {
      state.closePage("settings");
      return;
    }
    state.openPage("settings");
    const tab = normalizeSettingsTab(state.settingsTab);
    if (state.settingsTab !== tab) {
      set({ settingsTab: tab });
    }
  },

  setSettingsTab: (tab) => set({ settingsTab: normalizeSettingsTab(tab) }),

  openSettingsTab: (tab) => {
    const state = get();
    if (state.chatPanelExpanded || state.chatPanelLeaveAnimating) {
      set({
        chatPanelExpanded: false,
        chatPanelLeaveAnimating: false,
      });
    }
    if (!state.openPages.includes("settings")) {
      state.openPage("settings");
    } else {
      state.setActivePage("settings");
    }
    set({ settingsTab: normalizeSettingsTab(tab) });
  },


  startNewChat: () => {
    const { chat, openChatTabs, activeChatTabId, chatNavStack, chatNavPointer } = get();
    const synced = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const newTab = createEmptyChatTab();
    const stack = chatNavStack.slice(0, chatNavPointer + 1);
    stack.push(newTab.id);
    set({
      openChatTabs: [...synced, newTab],
      activeChatTabId: newTab.id,
      chat: [],
      chatNavStack: stack,
      chatNavPointer: stack.length - 1,
      showChatHistory: false,
      chatPanelOpen: true,
      chatPanelMode: "agent",
    });
  },

  switchChatTab: (id) => {
    const { chat, openChatTabs, activeChatTabId, chatNavStack, chatNavPointer } = get();
    if (id === activeChatTabId) return;
    const synced = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const tab = synced.find((t) => t.id === id);
    if (!tab) return;

    const existingIdx = chatNavStack.indexOf(id);
    let stack = chatNavStack;
    let pointer = chatNavPointer;

    if (existingIdx >= 0) {
      pointer = existingIdx;
      stack = stack.slice(0, existingIdx + 1);
    } else {
      stack = stack.slice(0, pointer + 1);
      stack.push(id);
      pointer = stack.length - 1;
    }

    set({
      openChatTabs: synced,
      activeChatTabId: id,
      chat: structuredClone(tab.messages),
      chatNavStack: stack,
      chatNavPointer: pointer,
      showChatHistory: false,
    });
  },

  canGoBackChat: () => get().chatNavPointer > 0,

  goBackChat: () => {
    const { chat, openChatTabs, activeChatTabId, chatNavStack, chatNavPointer } = get();
    if (chatNavPointer <= 0) return;
    const synced = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const pointer = chatNavPointer - 1;
    const id = chatNavStack[pointer];
    const tab = synced.find((t) => t.id === id);
    if (!tab) return;
    set({
      openChatTabs: synced,
      activeChatTabId: id,
      chat: structuredClone(tab.messages),
      chatNavPointer: pointer,
      showChatHistory: false,
    });
  },

  toggleChatHistory: () =>
    set((s) => ({
      showChatHistory: !s.showChatHistory,
      chatPanelMode: "agent",
    })),

  setChatPanelMode: (mode) =>
    set({
      chatPanelMode: mode,
      showChatHistory: false,
      activePage: null,
      openPages: [],
    }),

  toggleFriendsChatMode: () => {
    const next = get().chatPanelMode === "friends" ? "agent" : "friends";
    get().switchChatPanelMode(next);
  },

  cycleChatPanelMode: () => {
    const state = get();
    const inTheaterView =
      useCallsStore.getState().getCallsViewMode(state.activeRoomId) === "theater";
    const modes: Array<"agent" | "friends" | "calendar" | "theater"> = inTheaterView
      ? ["agent", "friends", "calendar", "theater"]
      : ["agent", "friends", "calendar"];
    const cycleMode =
      state.chatPanelMode === "ai-notes" || state.chatPanelMode === "follow-up"
        ? "agent"
        : state.chatPanelMode;
    const currentIdx = modes.indexOf(cycleMode);
    const safeIdx = currentIdx >= 0 ? currentIdx : 0;
    const nextMode = modes[(safeIdx + 1) % modes.length];
    set({
      chatPanelOpen: true,
      chatPanelMode: nextMode,
      showChatHistory: false,
      activePage: null,
      openPages: [],
    });
    writeUserPreferences(userPreferencesSnapshot({ ...get(), chatPanelOpen: true }));
  },

  openChatFromHistory: (id) => {
    const { chat, openChatTabs, activeChatTabId, chatSessions } = get();
    const synced = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const inTabs = synced.some((tab) => tab.id === id);
    if (inTabs) {
      get().switchChatTab(id);
      set({ showChatHistory: false });
      return;
    }
    if (chatSessions.some((session) => session.id === id)) {
      get().loadChatSession(id);
    }
  },

  saveRecordingSession: ({ recordingId, durationMs, createdAt }) => {
    const at = createdAt ?? Date.now();
    const title = `Enregistrement ${new Date(at).toLocaleString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const session: ChatSession = {
      id: recordingId,
      title,
      messages: [],
      updatedAt: at,
      kind: "recording",
      recordingId,
      durationMs,
    };
    set((s) => ({
      chatSessions: [session, ...s.chatSessions.filter((item) => item.id !== recordingId)],
    }));
    writeAutosave(get());
    return session;
  },

  loadChatSession: (id) => {
    const session = get().chatSessions.find((s) => s.id === id);
    if (!session) return;
    const { chat, openChatTabs, activeChatTabId } = get();
    const synced = updateActiveTabInTabs(openChatTabs, activeChatTabId, chat);
    const existing = synced.find((t) => t.id === id);
    if (existing) {
      get().switchChatTab(id);
      return;
    }
    const tab: ChatSession = {
      ...session,
      messages: structuredClone(session.messages),
    };
    const stack = get().chatNavStack.slice(0, get().chatNavPointer + 1);
    stack.push(tab.id);
    set({
      openChatTabs: [...synced, tab],
      activeChatTabId: tab.id,
      chat: structuredClone(session.messages),
      chatNavStack: stack,
      chatNavPointer: stack.length - 1,
      showChatHistory: false,
      chatPanelOpen: true,
    });
  },
}));
