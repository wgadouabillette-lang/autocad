import { isMarketingPreview, MARKETING_PREVIEW_WORKSPACE_ID } from "./marketingPreview";
import { useCallsStore } from "../store/useCallsStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { useStore } from "../store/useStore";

const CURSOR_CLASS = "marketing-preview-cursor";
const MOVE_MS = 720;
const CLICK_MS = 140;
const RECORD_MS = 4000;
const SALON_RENDER_MS = 160;
const SALON_BEAT_MS = 900;
const TUCK_OFFSET_X = 68;
const TUCK_OFFSET_Y = -48;
const HOTSPOT_X = 4;
const HOTSPOT_Y = 3;
const SALON_CHANNEL_ID = `${MARKETING_PREVIEW_WORKSPACE_ID}-open-main`;
const DUO_LOCAL = { id: "local", name: "You", isLocal: true as const };
const DUO_OTHER = { id: "jordan", name: "Jordan" };

let demoGen = 0;
let cursorEl: HTMLDivElement | null = null;

const CURSOR_SVG = `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
  <path
    d="M4.2 3.1 22.4 14.8l-7.2 1.6 3.4 8.1-3.3 1.4-3.4-8.1-5.1 4.7z"
    fill="#f4f4f5"
    stroke="#111"
    stroke-width="1.4"
    stroke-linejoin="round"
  />
</svg>`;

export function cancelMarketingPreviewRecordingDemo(): void {
  demoGen += 1;
  removeCursor();
  leaveMarketingPreviewDuoSalon();
}

export function stageMarketingPreviewSalonWaiting(): void {
  if (!isMarketingPreview()) return;
  const workspaceId = MARKETING_PREVIEW_WORKSPACE_ID;
  useCallsStore.setState((state) => {
    const room = state.callsByRoom[workspaceId];
    if (!room) return state;
    return {
      localInCallByRoom: { ...state.localInCallByRoom, [workspaceId]: false },
      localOpenChannelByRoom: { ...state.localOpenChannelByRoom, [workspaceId]: null },
      callsByRoom: {
        ...state.callsByRoom,
        [workspaceId]: {
          ...room,
          openChannels: room.openChannels.map((channel) =>
            channel.id === SALON_CHANNEL_ID
              ? {
                  ...channel,
                  inCall: true,
                  participants: [DUO_OTHER],
                }
              : {
                  ...channel,
                  participants: channel.participants.filter((person) => !person.isLocal),
                },
          ),
        },
      },
    };
  });
}

export function enterMarketingPreviewDuoSalon(): void {
  if (!isMarketingPreview()) return;
  const workspaceId = MARKETING_PREVIEW_WORKSPACE_ID;
  useCallsStore.setState((state) => {
    const room = state.callsByRoom[workspaceId];
    if (!room) return state;
    return {
      localInCallByRoom: { ...state.localInCallByRoom, [workspaceId]: true },
      localOpenChannelByRoom: { ...state.localOpenChannelByRoom, [workspaceId]: SALON_CHANNEL_ID },
      callsByRoom: {
        ...state.callsByRoom,
        [workspaceId]: {
          ...room,
          openChannels: room.openChannels.map((channel) =>
            channel.id === SALON_CHANNEL_ID
              ? {
                  ...channel,
                  inCall: true,
                  participants: [DUO_LOCAL, DUO_OTHER],
                }
              : {
                  ...channel,
                  participants: channel.participants.filter((person) => !person.isLocal),
                },
          ),
        },
      },
    };
  });
}

export function leaveMarketingPreviewDuoSalon(): void {
  if (!isMarketingPreview()) return;
  const workspaceId = MARKETING_PREVIEW_WORKSPACE_ID;
  useCallsStore.setState((state) => {
    const room = state.callsByRoom[workspaceId];
    if (!room) return state;
    return {
      localInCallByRoom: { ...state.localInCallByRoom, [workspaceId]: false },
      localOpenChannelByRoom: { ...state.localOpenChannelByRoom, [workspaceId]: null },
      callsByRoom: {
        ...state.callsByRoom,
        [workspaceId]: {
          ...room,
          openChannels: room.openChannels.map((channel) =>
            channel.id === SALON_CHANNEL_ID
              ? { ...channel, inCall: false, participants: [] }
              : channel,
          ),
        },
      },
    };
  });
}

export function startMarketingPreviewRecordingDemo(): void {
  if (!isMarketingPreview()) return;
  const gen = ++demoGen;
  void runRecordingCursorDemo(gen);
}

export function finishMarketingPreviewRecording(): void {
  if (!isMarketingPreview()) return;

  const recordingId = `preview-rec-${Date.now()}`;
  const at = Date.now();
  const title = `Recording ${new Date(at).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;

  useStore.setState((state) => ({
    chatSessions: [
      {
        id: recordingId,
        title,
        messages: [],
        updatedAt: at,
        kind: "recording" as const,
        recordingId,
        durationMs: RECORD_MS,
      },
      ...state.chatSessions.filter((item) => item.id !== recordingId),
    ],
    chatPanelOpen: true,
    chatPanelMode: "agent" as const,
    showChatHistory: false,
    chatHistoryHighlightRecordingId: recordingId,
    chatPanelExpanded: false,
    chatPanelLeaveAnimating: false,
  }));

  useNotificationsStore.setState((state) => ({
    items: [
      {
        id: `n-preview-rec-${at}`,
        kind: "recording" as const,
        category: "Recordings",
        title: "Recording saved",
        body: "Available in your notes history.",
        recordingSessionId: recordingId,
        createdAt: at,
        read: false,
      },
      ...state.items.filter((item) => !item.id.startsWith("n-preview-rec-")),
    ],
    panelOpen: true,
    panelOpenGeneration: state.panelOpenGeneration + 1,
    currentIndex: 0,
  }));
}

function removeCursor(): void {
  cursorEl?.remove();
  cursorEl = null;
}

function ensureCursor(): HTMLDivElement {
  if (cursorEl?.isConnected) return cursorEl;
  const el = document.createElement("div");
  el.className = CURSOR_CLASS;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = CURSOR_SVG;
  document.body.appendChild(el);
  cursorEl = el;
  return el;
}

function placeCursor(x: number, y: number, clicking = false): void {
  const el = ensureCursor();
  const scale = clicking ? 0.78 : 1;
  el.style.transform = `translate(${x - HOTSPOT_X}px, ${y - HOTSPOT_Y}px) scale(${scale})`;
  el.classList.toggle("is-clicking", clicking);
}

function buttonCenter(button: Element): { x: number; y: number } {
  const rect = button.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function findRecordButton(phase: "start" | "stop"): HTMLButtonElement | null {
  const label = phase === "start" ? "Record" : "Stop recording";
  const byLabel = document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  if (byLabel) return byLabel;
  return document.querySelector<HTMLButtonElement>(".marketing-preview-record-btn");
}

function findSalonJoinControl(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(
      ".call-block--open-channel.call-block--clickable .call-block__main",
    ) ?? document.querySelector<HTMLElement>('[aria-label^="Rejoindre"]')
  );
}

function wait(ms: number, gen: number): Promise<boolean> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(gen === demoGen), ms);
  });
}

async function clickTarget(target: HTMLElement, gen: number): Promise<boolean> {
  const { x, y } = buttonCenter(target);
  placeCursor(x, y, true);
  if (!(await wait(CLICK_MS, gen))) return false;
  target.click();
  placeCursor(x, y, false);
  return gen === demoGen;
}

function emptyMarketingPreviewAgentChat(): void {
  useStore.setState((state) => ({
    chat: [],
    openChatTabs: state.openChatTabs.map((tab) =>
      tab.id === state.activeChatTabId ? { ...tab, messages: [] } : tab,
    ),
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
    chatPanelOpen: true,
    chatPanelMode: "agent" as const,
    chatPanelExpanded: false,
    chatPanelLeaveAnimating: false,
    showChatHistory: false,
  }));
}

async function runRecordingCursorDemo(gen: number): Promise<void> {
  emptyMarketingPreviewAgentChat();
  useCallsStore.setState({ recording: false, recordingBusy: false, mediaError: null });
  useNotificationsStore.getState().closePanel();
  stageMarketingPreviewSalonWaiting();
  if (!(await wait(SALON_RENDER_MS, gen))) return;

  const originX = window.innerWidth * 0.46;
  const originY = window.innerHeight * 0.38;
  placeCursor(originX, originY, false);
  void ensureCursor().offsetWidth;
  if (!(await wait(80, gen))) return;

  const salonJoin = findSalonJoinControl();
  if (salonJoin) {
    const joinAt = buttonCenter(salonJoin);
    placeCursor(joinAt.x, joinAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(salonJoin, gen))) return;
  } else {
    enterMarketingPreviewDuoSalon();
  }
  if (!(await wait(SALON_BEAT_MS, gen))) return;

  const startBtn = findRecordButton("start");
  if (!startBtn) return;
  const startAt = buttonCenter(startBtn);
  placeCursor(startAt.x, startAt.y, false);
  if (!(await wait(MOVE_MS, gen))) return;
  if (!(await clickTarget(startBtn, gen))) return;

  const tuckX = startAt.x + TUCK_OFFSET_X;
  const tuckY = startAt.y + TUCK_OFFSET_Y;
  placeCursor(tuckX, tuckY, false);
  if (!(await wait(RECORD_MS, gen))) return;

  const stopBtn = findRecordButton("stop") ?? findRecordButton("start");
  if (!stopBtn) return;
  const stopAt = buttonCenter(stopBtn);
  placeCursor(stopAt.x, stopAt.y, false);
  if (!(await wait(MOVE_MS, gen))) return;
  if (!(await clickTarget(stopBtn, gen))) return;
  if (!(await wait(480, gen))) return;
  if (gen === demoGen) removeCursor();
}
