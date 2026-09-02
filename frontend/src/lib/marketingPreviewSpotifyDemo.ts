import {
  isMarketingPreview,
  isMarketingSpotifyPreviewScene,
  MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL,
  stripMarketingPlayDemoMessages,
} from "./marketingPreview";
import { updateActiveTabInTabs, useStore } from "../store/useStore";
import { useHallDjStore } from "../store/useHallDjStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";

const FEATURE_MESSAGE = "lyte-marketing-spotify-feature";
const PLAY_COMMAND = "/play blinding lights";
const CURSOR_CLASS = "marketing-preview-cursor";
const MOVE_MS = 720;
const ZOOM_MS = 720;
const CLICK_MS = 140;
const TYPE_MS = 72;
const HOLD_BEFORE_TYPE_MS = 20000;
const PLAYING_HOLD_MS = 4800;
const LOOP_GAP_MS = 900;
const LOADING_MS = 2500;
const HOTSPOT_X = 4;
const HOTSPOT_Y = 3;
const TUCK_OFFSET_X = 68;
const TUCK_OFFSET_Y = -48;
const CURSOR_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type CameraZoom = "hold" | "composer" | "results" | "playing";

const PREVIEW_TRACK = {
  id: "0VjIjW4GlUZAMYd2vXMi3b",
  name: "Blinding Lights",
  artists: "The Weeknd",
  album: "After Hours",
  url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
  imageUrl: MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL,
  durationMs: 200040,
};

let demoGen = 0;
let playTimer = 0;
let demoActive = false;
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

export function cancelMarketingPreviewSpotifyDemo(): void {
  demoGen += 1;
  if (playTimer) {
    window.clearTimeout(playTimer);
    playTimer = 0;
  }
  removeCursor();
  demoActive = false;
}

export function startMarketingPreviewSpotifyDemo(): void {
  if (!isMarketingPreview()) return;
  demoActive = true;
  const gen = ++demoGen;
  if (isMarketingSpotifyPreviewScene()) {
    void runPlayCommandDemo(gen);
    return;
  }
  void runSpotifyCursorDemo(gen);
}

/** Called from the real DJ button in marketing preview — no Spotify OAuth. */
export function beginMarketingPreviewDjFromClick(): void {
  if (!isMarketingPreview()) return;
  demoActive = true;
  useHallDjStore.setState({
    loading: true,
    active: false,
    error: null,
    feedbackResolvedTrackId: null,
  });
  if (playTimer) window.clearTimeout(playTimer);
  const gen = demoGen;
  playTimer = window.setTimeout(() => {
    if (gen !== demoGen) return;
    playTimer = 0;
    applyMarketingPreviewNowPlaying();
  }, LOADING_MS);
}

export function applyMarketingPreviewPlayback(track: {
  id?: string;
  name: string;
  artists: string;
  album?: string;
  url?: string;
  imageUrl?: string;
  durationMs?: number;
}): void {
  if (!isMarketingPreview()) return;
  useHallDjStore.setState({
    loading: false,
    active: false,
    error: null,
  });
  useSpotifyPlayerStore.setState({
    currentTrack: {
      id: track.id ?? PREVIEW_TRACK.id,
      name: track.name,
      artists: track.artists,
      album: track.album ?? "",
      url: track.url ?? "",
      imageUrl: track.imageUrl ?? "",
      durationMs: track.durationMs ?? PREVIEW_TRACK.durationMs,
    },
    lastPlayedTrack: null,
    playing: true,
    playbackMode: "full",
    playerNotice: null,
    panelOpen: false,
    premiumAvailable: true,
    streamingScopeAvailable: true,
  });
}

function restoreSpotifyIdle(): void {
  useStore.getState().stopAiRequest();
  setComposerText("");
  useStore.setState((state) => {
    const chat = stripMarketingPlayDemoMessages(state.chat);
    return {
      chat,
      openChatTabs: updateActiveTabInTabs(state.openChatTabs, state.activeChatTabId, chat),
      busy: false,
      activeAiRequests: 0,
      aiRun: null,
      chatPanelOpen: true,
      chatPanelMode: "agent" as const,
    };
  });
  resetMarketingPreviewSpotifyIdle();
}

function applyMarketingPreviewNowPlaying(): void {
  useHallDjStore.setState({
    loading: false,
    active: true,
    error: null,
  });
  useSpotifyPlayerStore.setState({
    currentTrack: PREVIEW_TRACK,
    lastPlayedTrack: null,
    playing: true,
    playbackMode: "full",
    playerNotice: null,
    panelOpen: false,
    premiumAvailable: true,
    streamingScopeAvailable: true,
  });
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

function resetMarketingPreviewSpotifyIdle(): void {
  if (!isMarketingPreview()) return;
  useHallDjStore.setState({
    active: false,
    loading: false,
    error: null,
    feedbackResolvedTrackId: null,
    feedbackBusy: false,
  });
  useSpotifyPlayerStore.setState({
    panelOpen: false,
    currentTrack: null,
    lastPlayedTrack: null,
    playing: false,
    playbackMode: null,
    queue: [],
    playerNotice: null,
    premiumAvailable: true,
    streamingScopeAvailable: true,
  });
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

function placeCursor(
  x: number,
  y: number,
  clicking = false,
  durationMs = MOVE_MS,
  zoom: CameraZoom = "composer",
  skipFocus = false,
): void {
  const el = ensureCursor();
  const scale = clicking ? 0.78 : 1;
  el.style.transitionTimingFunction = CURSOR_EASE;
  el.style.transitionDuration = `${clicking ? 90 : Math.max(0, durationMs)}ms`;
  el.style.transform = `translate(${x - HOTSPOT_X}px, ${y - HOTSPOT_Y}px) scale(${scale})`;
  el.classList.toggle("is-clicking", clicking);
  if (!skipFocus) postFeatureFocus(x, y, clicking ? 90 : durationMs, zoom);
}

function buttonCenter(target: Element): { x: number; y: number } {
  const rect = target.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function findDjButton(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(".marketing-preview-dj-btn") ??
    document.querySelector<HTMLButtonElement>('[aria-label="Démarrer le Meetra DJ"]')
  );
}

function findComposerField(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(".chat-composer textarea");
}

function findSendButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('.chat-composer [aria-label="Send"]');
}

function findBlindingLightsRow(): HTMLElement | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".spotify-track-list__row"));
  return (
    rows.find((row) => {
      const title = row.querySelector(".spotify-track-list__title")?.textContent?.trim() ?? "";
      return title.toLowerCase() === "blinding lights";
    }) ?? rows[0] ?? null
  );
}

function findPlayResultButton(): HTMLButtonElement | null {
  return (
    findBlindingLightsRow()?.querySelector<HTMLButtonElement>(".spotify-track-list__play") ??
    document.querySelector<HTMLButtonElement>(".spotify-track-list__play")
  );
}

function setComposerText(value: string): void {
  window.dispatchEvent(new CustomEvent("lyte-marketing-composer-text", { detail: value }));
}

function postFeaturePhase(phase: string): void {
  try {
    window.parent?.postMessage({ type: FEATURE_MESSAGE, phase }, window.location.origin);
  } catch {
    /* ignore */
  }
}

function postFeatureFocus(x: number, y: number, durationMs: number, zoom: CameraZoom): void {
  try {
    window.parent?.postMessage(
      { type: FEATURE_MESSAGE, phase: "focus", x, y, durationMs, zoom },
      window.location.origin,
    );
  } catch {
    /* ignore */
  }
}

function wait(ms: number, gen: number): Promise<boolean> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(gen === demoGen), ms);
  });
}

async function waitForEl<T extends Element>(
  selector: string,
  gen: number,
  timeoutMs = 5000,
): Promise<T | null> {
  const started = Date.now();
  while (gen === demoGen) {
    const el = document.querySelector<T>(selector);
    if (el) return el;
    if (Date.now() - started > timeoutMs) return null;
    if (!(await wait(50, gen))) return null;
  }
  return null;
}

async function waitForParentRun(
  gen: number,
  fallbackMs: number,
  focus?: { x: number; y: number },
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(ok && gen === demoGen);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; action?: unknown } | null;
      if (data?.type === FEATURE_MESSAGE && data.action === "run") finish(true);
    };
    window.addEventListener("message", onMessage);
    try {
      window.parent?.postMessage(
        {
          type: FEATURE_MESSAGE,
          phase: "ready",
          x: focus?.x,
          y: focus?.y,
        },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => finish(true), fallbackMs);
  });
}

async function clickTarget(
  target: HTMLElement,
  gen: number,
  zoom: CameraZoom = "composer",
  skipFocus = false,
): Promise<boolean> {
  const { x, y } = buttonCenter(target);
  placeCursor(x, y, true, 90, zoom, skipFocus);
  if (!(await wait(CLICK_MS, gen))) return false;
  target.click();
  placeCursor(x, y, false, 90, zoom, skipFocus);
  return gen === demoGen;
}

async function typeCommand(field: HTMLTextAreaElement, gen: number): Promise<boolean> {
  field.focus();
  for (let i = 1; i <= PLAY_COMMAND.length; i += 1) {
    if (gen !== demoGen) return false;
    setComposerText(PLAY_COMMAND.slice(0, i));
    const pause = PLAY_COMMAND[i - 1] === " " ? TYPE_MS + 160 : TYPE_MS;
    if (!(await wait(pause, gen))) return false;
  }
  return true;
}

function pinSearchListTop(): { x: number; y: number } | null {
  const scroll = document.querySelector<HTMLElement>(".chat-messages-scroll");
  const list = document.querySelector<HTMLElement>(".spotify-track-list");
  const prompt = document.querySelector<HTMLElement>(".chat-user-bubble--play-prompt");
  const pin = prompt ?? list;
  if (scroll && pin && scroll.contains(pin)) {
    const top =
      pin.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - 8;
    scroll.scrollTop = Math.max(0, top);
  }
  const frame = list ?? prompt;
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + Math.min(20, rect.height * 0.12) };
}

async function runPlayCommandDemo(gen: number): Promise<void> {
  restoreSpotifyIdle();
  if (!(await waitForEl(".chat-composer textarea", gen))) return;
  const fieldReady = findComposerField();
  const sendReady = findSendButton();
  const holdFocus =
    fieldReady && sendReady
      ? {
          x: (buttonCenter(fieldReady).x + buttonCenter(sendReady).x) / 2,
          y: (buttonCenter(fieldReady).y + buttonCenter(sendReady).y) / 2,
        }
      : undefined;
  if (holdFocus) postFeatureFocus(holdFocus.x, holdFocus.y, 0, "hold");
  if (!(await waitForParentRun(gen, HOLD_BEFORE_TYPE_MS, holdFocus))) return;

  const field = findComposerField();
  const send = findSendButton();
  if (!field || !send) return;

  const origin = buttonCenter(field);
  const sendAt = buttonCenter(send);
  placeCursor(origin.x - 72, origin.y - 46, false, 0, "hold");
  postFeatureFocus((origin.x + sendAt.x) / 2, (origin.y + sendAt.y) / 2, 0, "hold");
  void ensureCursor().offsetWidth;
  if (!(await wait(16, gen))) return;
  placeCursor(origin.x, origin.y, false, ZOOM_MS, "composer");
  postFeatureFocus((origin.x + sendAt.x) / 2, (origin.y + sendAt.y) / 2, ZOOM_MS, "composer");
  if (!(await wait(ZOOM_MS, gen))) return;

  if (!(await typeCommand(field, gen))) return;
  if (!(await wait(180, gen))) return;

  placeCursor(sendAt.x, sendAt.y, false, MOVE_MS, "composer");
  if (!(await wait(MOVE_MS, gen))) return;
  if (!(await clickTarget(send, gen, "composer", true))) return;
  postFeaturePhase("searching");

  const list = await waitForEl(".spotify-track-list", gen, 4500);
  if (!list || gen !== demoGen) return;
  postFeaturePhase("results");
  const resultsFocus = pinSearchListTop() ?? { x: sendAt.x, y: sendAt.y - 280 };
  postFeatureFocus(resultsFocus.x, resultsFocus.y, ZOOM_MS, "results");
  if (!(await wait(ZOOM_MS, gen))) return;
  if (!(await wait(400, gen))) return;
  const playBtn = findPlayResultButton();
  if (!playBtn) return;
  const playAt = buttonCenter(playBtn);
  placeCursor(playAt.x, playAt.y, false, MOVE_MS, "results");
  if (!(await wait(MOVE_MS, gen))) return;
  const playBtnNow = findPlayResultButton() ?? playBtn;
  if (!(await clickTarget(playBtnNow, gen, "results"))) return;
  postFeaturePhase("playing");
  const endFocus = holdFocus ?? {
    x: (buttonCenter(field).x + buttonCenter(send).x) / 2,
    y: (buttonCenter(field).y + buttonCenter(send).y) / 2,
  };
  placeCursor(playAt.x + TUCK_OFFSET_X, playAt.y + TUCK_OFFSET_Y, false, MOVE_MS, "hold", true);
  postFeatureFocus(endFocus.x, endFocus.y, MOVE_MS, "hold");

  if (!(await wait(PLAYING_HOLD_MS, gen))) return;
  removeCursor();
  restoreSpotifyIdle();
  postFeaturePhase("reset");
  if (!(await wait(LOOP_GAP_MS, gen))) return;
  if (gen === demoGen) void runPlayCommandDemo(gen);
}

async function runSpotifyCursorDemo(gen: number): Promise<void> {
  emptyMarketingPreviewAgentChat();
  resetMarketingPreviewSpotifyIdle();
  if (!(await wait(160, gen))) return;

  const originX = window.innerWidth * 0.46;
  const originY = window.innerHeight * 0.38;
  placeCursor(originX, originY, false);
  void ensureCursor().offsetWidth;
  if (!(await wait(80, gen))) return;

  const djBtn = findDjButton();
  if (djBtn) {
    const djAt = buttonCenter(djBtn);
    placeCursor(djAt.x, djAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(djBtn, gen))) return;
    placeCursor(djAt.x + TUCK_OFFSET_X, djAt.y + TUCK_OFFSET_Y, false);
  } else {
    beginMarketingPreviewDjFromClick();
  }

  if (!(await wait(LOADING_MS + 400, gen))) return;
  if (gen === demoGen) removeCursor();
}
