import {
  isMarketingHandoffPreviewScene,
  isMarketingPreview,
} from "./marketingPreview";
import { useHandoffStore } from "../store/useHandoffStore";
import { updateActiveTabInTabs, useStore } from "../store/useStore";

const FEATURE_MESSAGE = "lyte-marketing-handoff-feature";
const HANDOFF_COMMAND = "/handoff";
const CURSOR_CLASS = "marketing-preview-cursor";
const MOVE_MS = 720;
const ZOOM_MS = 720;
const CLICK_MS = 140;
const TYPE_MS = 72;
const HOLD_BEFORE_TYPE_MS = 20000;
const SENT_HOLD_MS = 3200;
const LOOP_GAP_MS = 900;
const HOTSPOT_X = 4;
const HOTSPOT_Y = 3;
const TUCK_OFFSET_X = 68;
const TUCK_OFFSET_Y = -48;
const CURSOR_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type CameraZoom = "hold" | "composer" | "results" | "done";

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

export function cancelMarketingPreviewHandoffDemo(): void {
  demoGen += 1;
  removeCursor();
}

export function startMarketingPreviewHandoffDemo(): void {
  if (!isMarketingPreview() || !isMarketingHandoffPreviewScene()) return;
  const gen = ++demoGen;
  void runHandoffCommandDemo(gen);
}

function restoreHandoffIdle(): void {
  useStore.getState().stopAiRequest();
  setComposerText("");
  window.dispatchEvent(new CustomEvent("lyte-marketing-skill-run-clear"));
  useHandoffStore.setState({
    selectionMode: false,
    selectionSource: null,
    peopleThreadId: null,
    selectedIndices: new Set(),
    target: null,
    submitting: false,
    error: null,
    preview: null,
    noteHandoffOpen: false,
    noteHandoffTitle: "",
    noteHandoffBodyHtml: "",
  });
  useStore.setState((state) => ({
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
    chatPanelOpen: true,
    chatPanelMode: "agent" as const,
    chatPanelExpanded: false,
    chatPanelLeaveAnimating: false,
    showChatHistory: false,
    openChatTabs: updateActiveTabInTabs(state.openChatTabs, state.activeChatTabId, state.chat),
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

function findComposerField(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(".chat-composer textarea");
}

function findSendButton(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>('.chat-composer [aria-label="Send handoff"]') ??
    document.querySelector<HTMLButtonElement>('.chat-composer [aria-label="Send"]')
  );
}

function findMessageChecks(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(".handoff-select-row__check"),
  );
}

function findRecipientButton(name: string): HTMLButtonElement | null {
  const items = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".handoff-recipient-picker__item"),
  );
  return (
    items.find((item) => item.textContent?.trim().toLowerCase() === name.toLowerCase()) ?? null
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
  for (let i = 1; i <= HANDOFF_COMMAND.length; i += 1) {
    if (gen !== demoGen) return false;
    setComposerText(HANDOFF_COMMAND.slice(0, i));
    const pause = HANDOFF_COMMAND[i - 1] === " " ? TYPE_MS + 160 : TYPE_MS;
    if (!(await wait(pause, gen))) return false;
  }
  return true;
}

function pinHandoffResultsFocus(): { x: number; y: number } | null {
  const bar = document.querySelector<HTMLElement>(".handoff-composer-bar");
  const row = document.querySelector<HTMLElement>(".handoff-select-row--active");
  const frame = bar ?? row;
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;
  if (bar) {
    return { x: rect.left + rect.width * 0.42, y: rect.top + Math.min(28, rect.height * 0.2) };
  }
  return { x: rect.left + rect.width * 0.5, y: rect.top + Math.min(24, rect.height * 0.15) };
}

async function runHandoffCommandDemo(gen: number): Promise<void> {
  restoreHandoffIdle();
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

  // Type without moving the cursor character-by-character.
  if (!(await typeCommand(field, gen))) return;
  if (!(await wait(180, gen))) return;

  const sendNow = findSendButton();
  if (!sendNow) return;
  const sendClickAt = buttonCenter(sendNow);
  placeCursor(sendClickAt.x, sendClickAt.y, false, MOVE_MS, "composer");
  if (!(await wait(MOVE_MS, gen))) return;
  if (!(await clickTarget(sendNow, gen, "composer", true))) return;
  postFeaturePhase("selecting");

  const bar = await waitForEl(".handoff-composer-bar", gen, 4500);
  if (!bar || gen !== demoGen) return;
  postFeaturePhase("results");
  const resultsFocus = pinHandoffResultsFocus() ?? {
    x: sendClickAt.x,
    y: sendClickAt.y - 220,
  };
  // One simultaneous de-zoom + pan into the handoff picker UI.
  postFeatureFocus(resultsFocus.x, resultsFocus.y, ZOOM_MS, "results");
  if (!(await wait(ZOOM_MS, gen))) return;
  if (!(await wait(320, gen))) return;

  // Select only the follow-up sent message (index 2), not the one-pager.
  const checks = findMessageChecks();
  const selectCheck = checks[2];
  if (selectCheck && selectCheck.getAttribute("aria-pressed") !== "true") {
    const at = buttonCenter(selectCheck);
    placeCursor(at.x, at.y, false, MOVE_MS, "results");
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(selectCheck, gen, "results"))) return;
    if (!(await wait(180, gen))) return;
  }

  let jordan: HTMLButtonElement | null = null;
  {
    const started = Date.now();
    while (gen === demoGen && !jordan) {
      jordan = findRecipientButton("Jordan");
      if (jordan || Date.now() - started > 3000) break;
      if (!(await wait(50, gen))) return;
    }
  }
  if (!jordan) return;
  const jordanAt = buttonCenter(jordan);
  placeCursor(jordanAt.x, jordanAt.y, false, MOVE_MS, "results");
  if (!(await wait(MOVE_MS, gen))) return;
  if (!(await clickTarget(jordan, gen, "results"))) return;
  if (!(await wait(220, gen))) return;

  const sendHandoff = findSendButton();
  if (!sendHandoff) return;
  const handoffSendAt = buttonCenter(sendHandoff);
  placeCursor(handoffSendAt.x, handoffSendAt.y, false, MOVE_MS, "results");
  if (!(await wait(MOVE_MS, gen))) return;
  if (!(await clickTarget(sendHandoff, gen, "results"))) return;
  postFeaturePhase("sent");

  await waitForEl(".skill-timeline, .chat-assistant-bubble", gen, 3500);
  if (!(await wait(600, gen))) return;

  const endFocus = holdFocus ?? {
    x: (buttonCenter(field).x + buttonCenter(send).x) / 2,
    y: (buttonCenter(field).y + buttonCenter(send).y) / 2,
  };
  placeCursor(
    handoffSendAt.x + TUCK_OFFSET_X,
    handoffSendAt.y + TUCK_OFFSET_Y,
    false,
    MOVE_MS,
    "hold",
    true,
  );
  postFeatureFocus(endFocus.x, endFocus.y, MOVE_MS, "hold");

  if (!(await wait(SENT_HOLD_MS, gen))) return;
  removeCursor();
  restoreHandoffIdle();
  postFeaturePhase("reset");
  if (!(await wait(LOOP_GAP_MS, gen))) return;
  if (gen === demoGen) void runHandoffCommandDemo(gen);
}
