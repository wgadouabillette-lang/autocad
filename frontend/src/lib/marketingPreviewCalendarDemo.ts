import { isMarketingPreview } from "./marketingPreview";
import { toDateKey } from "./daySchedule";
import { useCalendarOverlayStore } from "../store/useCalendarOverlayStore";
import { useCalendarStore } from "../store/useCalendarStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { useStore } from "../store/useStore";

const CURSOR_CLASS = "marketing-preview-cursor";
const MOVE_MS = 720;
const CLICK_MS = 140;
const HOTSPOT_X = 4;
const HOTSPOT_Y = 3;
const HOUR_HEIGHT = 48;
const DEMO_MEETING_PREFIX = "preview-cal-created-";
const DEMO_MEETING_ID = "preview-cal-demo-meeting";
const MEETING_TITLE = "Design sync";
const MEETING_START_HOUR = 13;
const MEETING_END_HOUR = 15;
const TYPE_MS = 42;

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

export function cancelMarketingPreviewCalendarDemo(): void {
  demoGen += 1;
  removeCursor();
  useCalendarOverlayStore.getState().closeComposer();
  stripDemoMeetings();
  useCalendarOverlayStore.getState().goToToday();
}

export function startMarketingPreviewCalendarDemo(): void {
  if (!isMarketingPreview()) return;
  const gen = ++demoGen;
  void runCalendarCursorDemo(gen);
}

function nextWeekDateKey(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toDateKey(date);
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

function isDemoMeetingId(id: string): boolean {
  return id === DEMO_MEETING_ID || id.startsWith(DEMO_MEETING_PREFIX);
}

function stripDemoMeetings(): void {
  useCalendarStore.setState((state) => ({
    userEvents: state.userEvents.filter((event) => !isDemoMeetingId(event.id)),
  }));
}

function seedCalendarDemoFriends(): void {
  usePeopleStore.setState((state) => {
    const extras = [
      { id: "jordan", name: "Jordan", handle: "jordan" },
      { id: "sam", name: "Sam", handle: "sam" },
    ];
    const existingIds = new Set(state.friends.map((friend) => friend.id));
    return {
      friends: [
        ...state.friends,
        ...extras.filter((friend) => !existingIds.has(friend.id)),
      ],
    };
  });
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(input) as HTMLInputElement;
  const descriptor =
    Object.getOwnPropertyDescriptor(proto, "value") ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
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

function findCalendarTab(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>(
      '.chat-panel-mode-tabs__btn[aria-label="Calendar"]',
    ) ?? document.querySelector<HTMLButtonElement>('[aria-label="Calendrier"]')
  );
}

function findHourSlot(hour: number): HTMLButtonElement | null {
  const label = `${String(hour).padStart(2, "0")}:00`;
  return document.querySelector<HTMLButtonElement>(
    `[aria-label="Ajouter un événement à ${label}"]`,
  );
}

function findComposerTitle(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    ".calendar-event-composer .chat-poll-composer__field--title",
  );
}

function findComposerTimeInputs(): HTMLInputElement[] {
  return [
    ...document.querySelectorAll<HTMLInputElement>(
      ".calendar-event-composer__time-field .calendar-event-composer__time-input",
    ),
  ];
}

function findFriendButton(name: string): HTMLButtonElement | null {
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    ".calendar-event-composer__friend",
  );
  return (
    [...buttons].find((button) => button.textContent?.includes(name)) ?? null
  );
}

function findCreateButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    ".calendar-event-composer .chat-poll-composer__publish",
  );
}

function timelineEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".calendar-panel__timeline");
}

function scrollTimelineToHour(hour: number, behavior: ScrollBehavior): void {
  const el = timelineEl();
  if (!el) return;
  el.scrollTo({
    top: Math.max(0, hour * HOUR_HEIGHT - HOUR_HEIGHT * 1.5),
    behavior,
  });
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

async function typeInto(
  input: HTMLInputElement,
  text: string,
  gen: number,
): Promise<boolean> {
  const { x, y } = buttonCenter(input);
  placeCursor(x, y, false);
  if (!(await wait(MOVE_MS, gen))) return false;
  input.focus();
  let current = "";
  for (const char of text) {
    current += char;
    setNativeInputValue(input, current);
    if (!(await wait(TYPE_MS, gen))) return false;
  }
  return gen === demoGen;
}

async function fillComposerAndCreate(gen: number): Promise<boolean> {
  const titleInput = findComposerTitle();
  if (titleInput) {
    if (!(await typeInto(titleInput, MEETING_TITLE, gen))) return false;
  }

  const timeInputs = findComposerTimeInputs();
  const startInput = timeInputs[0];
  const endInput = timeInputs[1];
  if (startInput) {
    const startAt = buttonCenter(startInput);
    placeCursor(startAt.x, startAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return false;
    setNativeInputValue(startInput, "13:00");
    if (!(await wait(180, gen))) return false;
  }
  if (endInput) {
    const endAt = buttonCenter(endInput);
    placeCursor(endAt.x, endAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return false;
    setNativeInputValue(endInput, "15:00");
    if (!(await wait(180, gen))) return false;
  }

  for (const name of ["Jordan", "Sam"]) {
    const friend = findFriendButton(name);
    if (!friend) continue;
    if (!(await clickTarget(friend, gen))) return false;
    if (!(await wait(220, gen))) return false;
  }

  const createBtn = findCreateButton();
  if (createBtn) {
    if (!(await clickTarget(createBtn, gen))) return false;
  }
  return gen === demoGen;
}

async function runCalendarCursorDemo(gen: number): Promise<void> {
  emptyMarketingPreviewAgentChat();
  seedCalendarDemoFriends();
  useCalendarOverlayStore.getState().closeComposer();
  useCalendarOverlayStore.getState().goToToday();
  stripDemoMeetings();
  if (!(await wait(160, gen))) return;

  const originX = window.innerWidth * 0.46;
  const originY = window.innerHeight * 0.38;
  placeCursor(originX, originY, false);
  void ensureCursor().offsetWidth;
  if (!(await wait(80, gen))) return;

  const calendarTab = findCalendarTab();
  if (calendarTab) {
    const tabAt = buttonCenter(calendarTab);
    placeCursor(tabAt.x, tabAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(calendarTab, gen))) return;
  } else {
    useStore.getState().openCalendarPanel();
  }
  if (!(await wait(420, gen))) return;

  scrollTimelineToHour(8, "smooth");
  if (!(await wait(900, gen))) return;
  scrollTimelineToHour(12, "smooth");
  if (!(await wait(800, gen))) return;

  useCalendarOverlayStore.getState().setSelectedDate(nextWeekDateKey());
  if (!(await wait(360, gen))) return;
  scrollTimelineToHour(MEETING_START_HOUR, "smooth");
  if (!(await wait(520, gen))) return;

  const slot = findHourSlot(MEETING_START_HOUR);
  if (slot) {
    const slotAt = buttonCenter(slot);
    placeCursor(slotAt.x, slotAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(slot, gen))) return;
  }
  if (!(await wait(360, gen))) return;
  if (!(await fillComposerAndCreate(gen))) return;
  if (!(await wait(720, gen))) return;
  if (gen === demoGen) removeCursor();
}
