import { isMarketingPreview, MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL } from "./marketingPreview";
import { useHallDjStore } from "../store/useHallDjStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { useStore } from "../store/useStore";

const CURSOR_CLASS = "marketing-preview-cursor";
const MOVE_MS = 720;
const CLICK_MS = 140;
const LOADING_MS = 2500;
const HOTSPOT_X = 4;
const HOTSPOT_Y = 3;
const TUCK_OFFSET_X = 68;
const TUCK_OFFSET_Y = -48;

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
  resetMarketingPreviewSpotifyIdle();
  demoActive = false;
}

export function startMarketingPreviewSpotifyDemo(): void {
  if (!isMarketingPreview()) return;
  demoActive = true;
  const gen = ++demoGen;
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
