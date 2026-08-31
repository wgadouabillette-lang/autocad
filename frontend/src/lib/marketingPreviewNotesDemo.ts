import { isMarketingPreview, MARKETING_PREVIEW_NOTE_ID, MARKETING_PREVIEW_WORKSPACE_ID } from "./marketingPreview";
import { leaveMarketingPreviewDuoSalon } from "./marketingPreviewRecordingDemo";
import { useAiNotesStore } from "../store/useAiNotesStore";
import { useCallsStore } from "../store/useCallsStore";
import { useStore } from "../store/useStore";

const CURSOR_CLASS = "marketing-preview-cursor";
const MOVE_MS = 720;
const CLICK_MS = 140;
const HOTSPOT_X = 4;
const HOTSPOT_Y = 3;
const SALON_RENDER_MS = 160;
const SALON_BEAT_MS = 900;
const LIVE_MS = 15_000;
const SALON_CHANNEL_ID = `${MARKETING_PREVIEW_WORKSPACE_ID}-open-main`;
const NOTES_LOCAL = { id: "local", name: "You", isLocal: true as const };
const NOTES_OTHERS = [
  { id: "jordan", name: "Jordan" },
  { id: "sam", name: "Sam" },
  { id: "riley", name: "Riley" },
] as const;

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

const STRUCTURE_V1 = [
  "<h2>Context</h2>",
  "<p>Design review in Salon vocal with You, Jordan, Sam, and Riley. Goal is to lock the dashboard layout and connector order before sprint 14.</p>",
  "<h2>Decisions</h2>",
  "<ul>",
  "<li>Keep Salon vocal as the default workspace home.</li>",
  "<li>Ship calendar two-way sync in <mark>sprint 14</mark>.</li>",
  "<li>Landing preview must show the real workspace shell, not a static mock.</li>",
  "</ul>",
  "<h2>Connectors</h2>",
  "<p>Jordan is mid-OAuth review. Gmail is still the blocker; Calendar should land first if the redirect URLs stay clean.</p>",
].join("");

const STRUCTURE_V2_ADD = [
  "<h3>Also decided</h3>",
  "<ul>",
  "<li>Defer Theater recording until September.</li>",
  "<li>Spotify stays in the bottom bar; no now-playing until someone starts DJ.</li>",
  "<li>Polls stay on the agent panel with the Thursday standup vote.</li>",
  "</ul>",
  "<ul>",
  "<li>Enable Spotify, Google Calendar, then Gmail.</li>",
  "<li>Outlook follows once the redirect URLs are approved.</li>",
  "</ul>",
  "<h2>Action items</h2>",
  "<ul>",
  "<li><strong>You</strong> — lock the dashboard layout <mark>this week</mark>.</li>",
  "<li><strong>Jordan</strong> — finish Gmail + Calendar OAuth and QA the Gmail connector <mark>by Wednesday</mark>.</li>",
  "<li><strong>Sam</strong> — polish the Notes empty state and validate open-channel join <mark>before Friday’s demo</mark>.</li>",
  "<li><strong>Riley</strong> — send the recap to leadership and book the follow-up.</li>",
  "</ul>",
].join("");

const STRUCTURE_V3_ADD = [
  "<h3>What we walked through</h3>",
  "<p>Voice grid, landing dashboard preview, Notes empty state, and the order we turn connectors on. Team agreed the lounge stays the home, and the landing chip demos must use the real app chrome.</p>",
  "<table><thead><tr><th>Connector</th><th>Owner</th><th>Status</th></tr></thead><tbody>",
  "<tr><td>Spotify</td><td>You</td><td>Ready for the landing demo</td></tr>",
  "<tr><td>Google Calendar</td><td>Jordan</td><td>Two-way sync in sprint 14</td></tr>",
  "<tr><td>Gmail</td><td>Jordan</td><td>OAuth still pending</td></tr>",
  "<tr><td>Outlook</td><td>Sam</td><td>After redirect URLs are approved</td></tr>",
  "</tbody></table>",
  "<h2>Risks</h2>",
  "<ul>",
  "<li>Gmail OAuth can slip the connector sequence if the redirect URLs fail review.</li>",
  "<li>Notes empty state still looks unfinished on first open — Sam is on it before Friday.</li>",
  "<li>Theater recording stays parked so it does not block the landing cut.</li>",
  "</ul>",
  "<h2>Next</h2>",
  "<p>Thursday <mark>10:00</mark> — standup in Salon vocal. Lock the sprint 14 board before then and send the recap after this call.</p>",
  "<h3>Open questions</h3>",
  "<ul>",
  "<li>Do we keep Follow-up as its own tab or fold it into Notes for the landing pass?</li>",
  "<li>Should Riley’s leadership recap include the connector table or just the decisions?</li>",
  "</ul>",
].join("");

const STRUCTURE_V2 = STRUCTURE_V1 + STRUCTURE_V2_ADD;
const STRUCTURE_V3 = STRUCTURE_V2 + STRUCTURE_V3_ADD;

function setNotesSalonParticipants(
  participants: Array<{ id: string; name: string; isLocal?: true }>,
  localInCall: boolean,
): void {
  if (!isMarketingPreview()) return;
  const workspaceId = MARKETING_PREVIEW_WORKSPACE_ID;
  useCallsStore.setState((state) => {
    const room = state.callsByRoom[workspaceId];
    if (!room) return state;
    return {
      localInCallByRoom: { ...state.localInCallByRoom, [workspaceId]: localInCall },
      localOpenChannelByRoom: {
        ...state.localOpenChannelByRoom,
        [workspaceId]: localInCall ? SALON_CHANNEL_ID : null,
      },
      callsByRoom: {
        ...state.callsByRoom,
        [workspaceId]: {
          ...room,
          openChannels: room.openChannels.map((channel) =>
            channel.id === SALON_CHANNEL_ID
              ? { ...channel, inCall: true, participants }
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

function stageMarketingPreviewNotesSalonWaiting(): void {
  setNotesSalonParticipants([...NOTES_OTHERS], false);
}

function enterMarketingPreviewNotesSalon(): void {
  setNotesSalonParticipants([NOTES_LOCAL, ...NOTES_OTHERS], true);
}

export function cancelMarketingPreviewNotesDemo(): void {
  demoGen += 1;
  removeCursor();
  resetNotesIdle();
  leaveMarketingPreviewDuoSalon();
}

export function startMarketingPreviewNotesDemo(): void {
  if (!isMarketingPreview()) return;
  const gen = ++demoGen;
  void runNotesCursorDemo(gen);
}

export function beginMarketingPreviewAiNotesFromClick(
  workspaceId?: string,
  manualNoteId?: string | null,
): void {
  if (!isMarketingPreview()) return;
  useAiNotesStore.setState({
    active: true,
    busy: false,
    error: null,
    structureError: null,
    lines: [],
    interimText: "",
    structuredHtml: "",
    structuring: false,
    nextStructureAt: Date.now() + 4000,
    startedAt: Date.now(),
    workspaceId: workspaceId ?? MARKETING_PREVIEW_WORKSPACE_ID,
    sessionId: manualNoteId ?? MARKETING_PREVIEW_NOTE_ID,
  });
}

function resetNotesIdle(): void {
  useAiNotesStore.setState({
    active: false,
    busy: false,
    lines: [],
    interimText: "",
    structuredHtml: "",
    structuring: false,
    structureError: null,
    nextStructureAt: null,
    error: null,
    startedAt: null,
    workspaceId: null,
    sessionId: null,
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

function findSalonJoinControl(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(
      ".call-block--open-channel.call-block--clickable .call-block__main",
    ) ?? document.querySelector<HTMLElement>('[aria-label^="Rejoindre"]')
  );
}

function findNotesTab(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    '.chat-panel-mode-tabs__btn[aria-label="Notes"]',
  );
}

function findExpandButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[aria-label="Expand panel"]');
}

function prepareBlankLiveNote(): void {
  useStore.setState((state) => ({
    activeManualNoteId: MARKETING_PREVIEW_NOTE_ID,
    manualNoteResetTick: state.manualNoteResetTick + 1,
    chatSessions: state.chatSessions.map((session) =>
      session.id === MARKETING_PREVIEW_NOTE_ID
        ? {
            ...session,
            title: "Design review",
            manualNoteTitle: "Design review",
            manualNoteBody: "",
            messages: [],
          }
        : session,
    ),
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

function appendFinalLine(text: string): void {
  useAiNotesStore.setState((state) => ({
    lines: [...state.lines, { id: `preview-ln-${Date.now()}`, text, isFinal: true }],
    interimText: "",
    error: null,
  }));
}

function setInterim(text: string): void {
  useAiNotesStore.setState({ interimText: text, error: null });
}

function setStructured(html: string): void {
  useAiNotesStore.setState({
    structuring: false,
    structuredHtml: html,
    structureError: null,
    nextStructureAt: Date.now() + 4000,
  });
}

async function runLiveNotesAnimation(gen: number): Promise<void> {
  const started = Date.now();
  const remaining = () => Math.max(0, LIVE_MS - (Date.now() - started));

  setInterim("Can we lock the dashboard layout this week and keep Salon vocal as home?");
  if (!(await wait(Math.min(900, remaining()), gen))) return;
  appendFinalLine("Can we lock the dashboard layout this week and keep Salon vocal as home?");

  setInterim("I'll take the OAuth check for Gmail and Calendar — Gmail is still the blocker.");
  if (!(await wait(Math.min(1000, remaining()), gen))) return;
  appendFinalLine("I'll take the OAuth check for Gmail and Calendar — Gmail is still the blocker.");

  useAiNotesStore.setState({ structuring: true });
  if (!(await wait(Math.min(450, remaining()), gen))) return;
  setStructured(STRUCTURE_V1);

  setInterim("Calendar two-way sync should ship in sprint 14. Defer Theater recording until September.");
  if (!(await wait(Math.min(1100, remaining()), gen))) return;
  appendFinalLine("Calendar two-way sync should ship in sprint 14. Defer Theater recording until September.");

  setInterim("I'm polishing the Notes empty state and checking open-channel join before Friday's demo.");
  if (!(await wait(Math.min(1100, remaining()), gen))) return;
  appendFinalLine("I'm polishing the Notes empty state and checking open-channel join before Friday's demo.");

  setInterim("Spotify first, then Calendar, then Gmail. Outlook after the redirect URLs are approved.");
  if (!(await wait(Math.min(1000, remaining()), gen))) return;
  appendFinalLine("Spotify first, then Calendar, then Gmail. Outlook after the redirect URLs are approved.");

  useAiNotesStore.setState({ structuring: true });
  if (!(await wait(Math.min(500, remaining()), gen))) return;
  setStructured(STRUCTURE_V2);

  setInterim("I'll send the recap to leadership and book the follow-up after this call.");
  if (!(await wait(Math.min(1000, remaining()), gen))) return;
  appendFinalLine("I'll send the recap to leadership and book the follow-up after this call.");

  setInterim("Thursday standup stays at 10 in Salon vocal. Lock the sprint 14 board before then.");
  if (!(await wait(Math.min(1000, remaining()), gen))) return;
  appendFinalLine("Thursday standup stays at 10 in Salon vocal. Lock the sprint 14 board before then.");

  setInterim("If Gmail slips, the leadership recap should still include the connector table.");
  if (!(await wait(Math.min(900, remaining()), gen))) return;
  appendFinalLine("If Gmail slips, the leadership recap should still include the connector table.");

  useAiNotesStore.setState({ structuring: true });
  if (!(await wait(Math.min(500, remaining()), gen))) return;
  setStructured(STRUCTURE_V3);

  if (remaining() > 0 && !(await wait(remaining(), gen))) return;
}

async function runNotesCursorDemo(gen: number): Promise<void> {
  emptyMarketingPreviewAgentChat();
  resetNotesIdle();
  prepareBlankLiveNote();
  stageMarketingPreviewNotesSalonWaiting();
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
  }
  enterMarketingPreviewNotesSalon();
  if (!(await wait(SALON_BEAT_MS, gen))) return;

  const notesTab = findNotesTab();
  if (notesTab) {
    const tabAt = buttonCenter(notesTab);
    placeCursor(tabAt.x, tabAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(notesTab, gen))) return;
  } else {
    useStore.getState().openAiNotesPanel();
  }
  if (!(await wait(360, gen))) return;

  const expand = findExpandButton();
  if (expand) {
    const expandAt = buttonCenter(expand);
    placeCursor(expandAt.x, expandAt.y, false);
    if (!(await wait(MOVE_MS, gen))) return;
    if (!(await clickTarget(expand, gen))) return;
  } else {
    useStore.setState({
      chatPanelExpanded: true,
      chatPanelLeaveAnimating: false,
    });
  }
  if (!(await wait(420, gen))) return;

  const expandAt = expand ? buttonCenter(expand) : { x: window.innerWidth * 0.72, y: window.innerHeight * 0.22 };
  placeCursor(expandAt.x + 56, expandAt.y + 72, false);
  beginMarketingPreviewAiNotesFromClick();

  await runLiveNotesAnimation(gen);
  if (gen === demoGen) removeCursor();
}
