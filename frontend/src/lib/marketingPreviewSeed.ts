import type { CallBlock, OpenVoiceChannel, RoomCallsState } from "./calls";
import { memberBlockId } from "./calls";
import {
  MARKETING_PREVIEW_NOTE_ID,
  MARKETING_PREVIEW_USER_ID,
  MARKETING_PREVIEW_WORKSPACE_ID,
} from "./marketingPreview";
import type { TheaterState } from "./theater";
import type { ChatMessage, ChatSession } from "../store/useStore";
import type { CalendarEvent } from "../store/useCalendarStore";
import type { FollowUpDraft } from "./followUps";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useConnectorsStore } from "../store/useConnectorsStore";
import { useFollowUpsStore } from "../store/useFollowUpsStore";
import { useStore } from "../store/useStore";
import {
  PRESENCE_OFFLINE_AFTER_MS,
  useWorkspacePresenceStore,
} from "../store/useWorkspacePresenceStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";
import { useCalendarOverlayStore } from "../store/useCalendarOverlayStore";
import { useCalendarStore } from "../store/useCalendarStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { CHAT_CONNECTORS } from "../components/chat/chatConnectors";
import { presenceActivityKey, type PresenceActivityId } from "./presenceActivity";
import { toDateKey } from "./daySchedule";
import { pickWorkspaceAccent } from "./workspaces";

const LOCAL_USER = { id: "local", name: "You", isLocal: true as const };

const DEMO_MEMBERS = [
  { id: "jordan", name: "Jordan" },
  { id: "sam", name: "Sam" },
  { id: "riley", name: "Riley" },
  { id: "morgan", name: "Morgan" },
  { id: "casey", name: "Casey" },
  { id: "taylor", name: "Taylor" },
  { id: "quinn", name: "Quinn" },
  { id: "avery", name: "Avery" },
  { id: "elena", name: "Elena" },
  { id: "noah", name: "Noah" },
  { id: "zoe", name: "Zoe" },
  { id: "chris", name: "Chris" },
  { id: "lena", name: "Lena" },
  { id: "omar", name: "Omar" },
  { id: "nadia", name: "Nadia" },
  { id: "felix", name: "Felix" },
];

const OFFLINE_MEMBER_IDS = new Set(["quinn", "avery"]);

const PREVIEW_PRESENCE_ACTIVITIES: Record<string, PresenceActivityId> = {
  jordan: "claude",
  sam: "claude",
  riley: "claude",
  morgan: "claude",
  casey: "openai",
  taylor: "openai",
  elena: "spotify",
  noah: "spotify",
  zoe: "spotify",
  chris: "spotify",
};

const THEATER_AUDIENCE_EXTRA = [
  { id: "jamie", name: "Jamie" },
  { id: "dana", name: "Dana" },
  { id: "robin", name: "Robin" },
  { id: "kai", name: "Kai" },
  { id: "elena", name: "Elena" },
  { id: "noah", name: "Noah" },
  { id: "zoe", name: "Zoe" },
  { id: "chris", name: "Chris" },
  { id: "lena", name: "Lena" },
  { id: "omar", name: "Omar" },
  { id: "nadia", name: "Nadia" },
  { id: "felix", name: "Felix" },
  { id: "hana", name: "Hana" },
  { id: "devon", name: "Devon" },
  { id: "sky", name: "Sky" },
  { id: "priya", name: "Priya" },
  { id: "marc", name: "Marc" },
  { id: "julia", name: "Julia" },
  { id: "ethan", name: "Ethan" },
  { id: "sophie", name: "Sophie" },
  { id: "lucas", name: "Lucas" },
  { id: "mia", name: "Mia" },
  { id: "alex-k", name: "Alex K." },
  { id: "nina", name: "Nina" },
  { id: "theo", name: "Theo" },
  { id: "vera", name: "Vera" },
  { id: "oscar", name: "Oscar" },
  { id: "ines", name: "Ines" },
  { id: "paul", name: "Paul" },
  { id: "clara", name: "Clara" },
  { id: "hugo", name: "Hugo" },
  { id: "sara", name: "Sara" },
  { id: "yuki", name: "Yuki" },
  { id: "amir", name: "Amir" },
  { id: "luna", name: "Luna" },
  { id: "iris", name: "Iris" },
  { id: "marco", name: "Marco" },
  { id: "anna", name: "Anna" },
  { id: "ben", name: "Ben" },
  { id: "coco", name: "Coco" },
  { id: "diego", name: "Diego" },
];

const THEATER_SPEAKER_COUNT = 2;
const THEATER_AUDIENCE_SIZE = 21;
const THEATER_PREVIEW_AUDIENCE_SIZE = 48;

const PREVIEW_NOTE_BODY_HTML = [
  "<h1>Design review — key decisions</h1>",
  "<h2>Voice &amp; dashboard</h2>",
  "<p>Team aligned on the <strong>voice channel grid</strong> and using the live workspace shell on the landing page.</p>",
  "<ul>",
  "<li>Finalize navigation layout and hero spacing</li>",
  "<li>Ship connector sync (Gmail, Calendar, Spotify)</li>",
  "<li>QA mobile breakpoints and chat panel tabs</li>",
  "</ul>",
  "<h2>Action items</h2>",
  "<p><mark>Jordan</mark> owns connector wiring. <mark>Sam</mark> validates voice lounge UX by Friday.</p>",
  "<p>Riley prepares onboarding copy for the next sprint demo.</p>",
].join("");

function memberBlock(userId: string, name: string, inCall = false): CallBlock {
  const isLocal = userId === "local";
  return {
    id: memberBlockId(MARKETING_PREVIEW_WORKSPACE_ID, userId),
    roomId: MARKETING_PREVIEW_WORKSPACE_ID,
    participants: isLocal ? [{ ...LOCAL_USER }] : [{ id: userId, name }],
    inCall,
  };
}

function buildRoomCallsState(): RoomCallsState {
  const inCallPeers = DEMO_MEMBERS.slice(0, 2);
  const blocks: CallBlock[] = [
    memberBlock("local", LOCAL_USER.name, false),
    ...DEMO_MEMBERS.map((member, index) =>
      memberBlock(member.id, member.name, index < 2),
    ),
  ];

  const openChannels: OpenVoiceChannel[] = [
    {
      id: `${MARKETING_PREVIEW_WORKSPACE_ID}-open-main`,
      roomId: MARKETING_PREVIEW_WORKSPACE_ID,
      name: "Voice lounge",
      participants: inCallPeers.map((member) => ({ id: member.id, name: member.name })),
      inCall: true,
    },
  ];

  return {
    blocks,
    openChannels,
    requests: [],
    handRaises: [],
  };
}

function buildTheaterState(audienceSize = THEATER_AUDIENCE_SIZE): TheaterState {
  const speakers = DEMO_MEMBERS.slice(0, THEATER_SPEAKER_COUNT).map((member) => ({
    id: member.id,
    name: member.name,
    role: "speaker" as const,
  }));
  const audience = [
    ...DEMO_MEMBERS.slice(THEATER_SPEAKER_COUNT).map((member) => ({
      id: member.id,
      name: member.name,
      role: "audience" as const,
    })),
    ...THEATER_AUDIENCE_EXTRA.map((member) => ({
      id: member.id,
      name: member.name,
      role: "audience" as const,
    })),
  ].slice(0, audienceSize);

  return {
    workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
    speakers,
    audience,
    audienceSeatByUserId: Object.fromEntries(audience.map((member, index) => [member.id, index])),
    question: null,
    handRaises: [],
    localRole: null,
  };
}

function buildDiscussionTab(
  id: string,
  title: string,
  messages: ChatMessage[],
  updatedAtOffsetMs = 0,
): ChatSession {
  return {
    id,
    title,
    messages,
    updatedAt: Date.now() - updatedAtOffsetMs,
    kind: "discussion",
  };
}

function buildAgentChatTabs(): {
  tabs: ChatSession[];
  activeId: string;
  activeMessages: ChatMessage[];
} {
  const tabs = [
    buildDiscussionTab(
      "preview-chat-design",
      "Design review",
      [
        {
          role: "user",
          text: "Summarize what we decided in yesterday's design review.",
        },
        {
          role: "assistant",
          text:
            "The team aligned on the new navigation layout, confirmed the voice channel grid for the dashboard, and scheduled a follow-up to wire calendar connectors.",
        },
        {
          role: "user",
          text: "Draft a short update I can share with the team.",
        },
        {
          role: "assistant",
          text:
            "We finalized the dashboard layout and voice grid. Landing now shows the real workspace shell. Calendar connector wiring is next on the roadmap.",
        },
      ],
      0,
    ),
    buildDiscussionTab(
      "preview-chat-standup",
      "Daily standup",
      [
        { role: "user", text: "What blocked the voice lounge rollout?" },
        {
          role: "assistant",
          text:
            "OAuth review for Gmail is still pending. Jordan is testing calendar sync today; Sam is validating the open-channel UX.",
        },
      ],
      45 * 60_000,
    ),
    buildDiscussionTab(
      "preview-chat-connectors",
      "Connector setup",
      [
        { role: "user", text: "Which connectors should we enable first for the demo workspace?" },
        {
          role: "assistant",
          text: "Start with Spotify, Google Calendar, and Gmail. Outlook can follow once the OAuth redirect URLs are approved.",
        },
        { role: "user", text: "Write a one-liner for the settings page." },
        {
          role: "assistant",
          text: "Connect your tools once — play music, schedule meetings, and draft emails without leaving Hall.",
        },
      ],
      2 * 3600_000,
    ),
    buildDiscussionTab(
      "preview-chat-onboarding",
      "Onboarding copy",
      [
        { role: "user", text: "Suggest welcome copy for new workspace members." },
        {
          role: "assistant",
          text:
            "Welcome to Design Team — join a voice channel, open the agent, or connect your calendar to get started in under a minute.",
        },
      ],
      5 * 3600_000,
    ),
    buildDiscussionTab(
      "preview-chat-spotify",
      "Spotify in chat",
      [
        { role: "user", text: "/play focus playlist for design review" },
        {
          role: "assistant",
          text: "Queued a focus playlist — playback controls are in the bottom bar. You can add tracks from the composer with /play or /queue.",
        },
      ],
      8 * 3600_000,
    ),
  ];

  return {
    tabs,
    activeId: tabs[0].id,
    activeMessages: structuredClone(tabs[0].messages),
  };
}

function buildManualNoteSession(): ChatSession {
  return {
    id: MARKETING_PREVIEW_NOTE_ID,
    title: "Design review notes",
    messages: [{ role: "user", text: PREVIEW_NOTE_BODY_HTML }],
    updatedAt: Date.now() - 20 * 60_000,
    kind: "note",
    manualNoteTitle: "Design review notes",
    manualNoteBody: PREVIEW_NOTE_BODY_HTML,
  };
}

function buildPreviewCalendarEvents(today: string): CalendarEvent[] {
  return [
    {
      id: "preview-cal-1",
      dateKey: today,
      startMinutes: 8 * 60,
      endMinutes: 8 * 60 + 30,
      title: "Team standup",
      detail: "Design Team · Voice lounge",
      source: "google",
      googleEventId: "preview-g-1",
    },
    {
      id: "preview-cal-2",
      dateKey: today,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 45,
      title: "Design review",
      detail: "Dashboard layout + hero",
      source: "user",
    },
    {
      id: "preview-cal-3",
      dateKey: today,
      startMinutes: 10 * 60 + 30,
      endMinutes: 11 * 60 + 15,
      title: "Jordan · OAuth check",
      detail: "Gmail + Calendar connectors",
      source: "google",
      googleEventId: "preview-g-2",
    },
    {
      id: "preview-cal-4",
      dateKey: today,
      startMinutes: 11 * 60 + 30,
      endMinutes: 12 * 60 + 15,
      title: "Voice lounge walkthrough",
      source: "user",
    },
    {
      id: "preview-cal-5",
      dateKey: today,
      startMinutes: 12 * 60 + 30,
      endMinutes: 13 * 60 + 15,
      title: "Lunch",
      source: "google",
      googleEventId: "preview-g-3",
    },
    {
      id: "preview-cal-6",
      dateKey: today,
      startMinutes: 13 * 60 + 30,
      endMinutes: 14 * 60 + 30,
      title: "Connector QA",
      detail: "Spotify · Gmail · Calendar",
      source: "user",
    },
    {
      id: "preview-cal-7",
      dateKey: today,
      startMinutes: 14 * 60 + 45,
      endMinutes: 15 * 60 + 30,
      title: "Landing preview review",
      detail: "Marketing · Live dashboard mock",
      source: "google",
      googleEventId: "preview-g-4",
    },
    {
      id: "preview-cal-8",
      dateKey: today,
      startMinutes: 15 * 60 + 30,
      endMinutes: 16 * 60 + 15,
      title: "Follow-up workshop",
      source: "user",
    },
    {
      id: "preview-cal-9",
      dateKey: today,
      startMinutes: 16 * 60 + 30,
      endMinutes: 17 * 60 + 30,
      title: "Sprint planning",
      detail: "Backlog grooming",
      source: "google",
      googleEventId: "preview-g-5",
    },
    {
      id: "preview-cal-10",
      dateKey: today,
      startMinutes: 17 * 60 + 45,
      endMinutes: 18 * 60 + 15,
      title: "Demo dry run",
      source: "user",
    },
  ];
}

function buildFollowUpDraft(): FollowUpDraft {
  const today = toDateKey(new Date());
  const tomorrow = toDateKey(new Date(Date.now() + 86_400_000));
  return {
    id: "preview-follow-up",
    roomId: MARKETING_PREVIEW_WORKSPACE_ID,
    recap:
      "Design review covered the voice grid, landing dashboard preview, and connector priorities. Team agreed to ship Spotify + Calendar first, then Gmail. Jordan tests OAuth; Sam validates open-channel UX.",
    actions: [
      {
        id: "preview-fu-a1",
        title: "Ship connector OAuth redirect URLs",
        detail: "Gmail + Calendar",
        dueDate: tomorrow,
        startMinutes: 10 * 60,
        endMinutes: 10 * 60 + 30,
        selected: true,
      },
      {
        id: "preview-fu-a2",
        title: "Record landing preview walkthrough",
        detail: "Voice lounge + agent tabs",
        dueDate: tomorrow,
        startMinutes: 14 * 60,
        endMinutes: 15 * 60,
        selected: true,
      },
      {
        id: "preview-fu-a3",
        title: "Plan sprint demo",
        dueDate: today,
        startMinutes: 16 * 60 + 30,
        endMinutes: 17 * 60,
        selected: true,
      },
    ],
    emails: [
      {
        id: "preview-fu-e1",
        to: "jordan@demo.hall.app",
        subject: "Follow-up — Design review",
        body:
          "Hi Jordan,\n\nThanks for the review today. Can you confirm Gmail OAuth by tomorrow morning?\n\n— Alex",
        selected: true,
      },
      {
        id: "preview-fu-e2",
        to: "sam@demo.hall.app",
        subject: "Voice lounge UX checklist",
        body:
          "Hi Sam,\n\nPlease validate open-channel join flow and spotlight layout before we record the landing demo.\n\n— Alex",
        selected: true,
      },
    ],
    createdAt: Date.now() - 15 * 60_000,
  };
}

function seedPresence(): void {
  const now = Date.now();
  const members: Record<
    string,
    {
      displayName: string;
      lastSeenMs: number;
      voice: { inPrivateCall: boolean; openChannelId: string | null };
    }
  > = {};

  for (const member of DEMO_MEMBERS) {
    const isOffline = OFFLINE_MEMBER_IDS.has(member.id);
    members[member.id] = {
      displayName: member.name,
      lastSeenMs: isOffline ? now - PRESENCE_OFFLINE_AFTER_MS - 60_000 : now,
      voice: {
        inPrivateCall: member.id === "jordan" || member.id === "sam",
        openChannelId:
          member.id === "jordan" || member.id === "sam"
            ? `${MARKETING_PREVIEW_WORKSPACE_ID}-open-main`
            : null,
      },
    };
  }

  useWorkspacePresenceStore.setState({
    loadedByWorkspace: { [MARKETING_PREVIEW_WORKSPACE_ID]: true },
    membersByWorkspace: { [MARKETING_PREVIEW_WORKSPACE_ID]: members },
  });
}

function seedPresenceActivities(): void {
  const byKey: Record<string, PresenceActivityId> = {};
  for (const [userId, activity] of Object.entries(PREVIEW_PRESENCE_ACTIVITIES)) {
    byKey[presenceActivityKey(MARKETING_PREVIEW_WORKSPACE_ID, userId)] = activity;
  }
  usePresenceActivityStore.setState({ byKey });
}

function seedConnectors(): void {
  useConnectorsStore.setState({
    statuses: CHAT_CONNECTORS.map(({ id, label }) => ({
      id,
      label,
      provider: id,
      connected: id === "spotify",
      configured: id === "spotify" || id === "calendar" || id === "gmail",
      accountLabel: id === "spotify" ? "Alex" : undefined,
    })),
    loading: false,
    error: null,
    connectingId: null,
    inflight: null,
  });
}

function seedSpotifyPlayback(): void {
  useSpotifyPlayerStore.setState({
    panelOpen: false,
    searchQuery: "",
    results: [],
    searching: false,
    searchError: null,
    currentTrack: {
      id: "preview-spotify-track",
      name: "Midnight City",
      artists: "M83",
      album: "Hurry Up, We're Dreaming",
      url: "https://open.spotify.com/",
      imageUrl: null,
    },
    lastPlayedTrack: null,
    queue: [],
    history: [],
    playing: true,
    playbackMode: "preview",
    premiumAvailable: true,
    playerNotice: null,
  });
}

function seedCalendar(): void {
  const today = toDateKey(new Date());
  const events = buildPreviewCalendarEvents(today);
  useCalendarOverlayStore.setState({ selectedDate: today, composerOpen: false });
  useCalendarStore.setState({
    userEvents: events.filter((event) => event.source === "user"),
    googleEvents: events.filter((event) => event.source === "google"),
    outlookEvents: [],
  });
}

function seedPeopleThreads(): void {
  const now = Date.now();
  const threads = DEMO_MEMBERS.slice(0, 8).map((member, index) => ({
    id: `colleague-${MARKETING_PREVIEW_WORKSPACE_ID}-${member.id}`,
    personId: member.id,
    personName: member.name,
    section: "colleagues" as const,
    workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
    preview:
      index === 0
        ? "Can you join the voice lounge?"
        : index === 1
          ? "Shared the dashboard mockup."
          : index === 2
            ? "Calendar looks busy today."
            : "On my way.",
    updatedAt: now - index * 120_000,
    unread: index === 0 ? 1 : index === 2 ? 1 : 0,
    messages: [
      {
        id: `preview-msg-${member.id}`,
        author: member.name,
        authorUid: member.id,
        text:
          index === 0
            ? "Can you join the voice lounge?"
            : index === 1
              ? "Shared the dashboard mockup."
              : index === 2
                ? "Calendar looks busy today — still good for 3pm?"
                : "On my way.",
        at: now - index * 120_000,
      },
    ],
  }));

  usePeopleStore.setState({
    colleagueThreadsByWorkspace: {
      [MARKETING_PREVIEW_WORKSPACE_ID]: threads,
    },
  });
}

function seedFollowUp(): void {
  useFollowUpsStore.setState({
    generating: false,
    draft: buildFollowUpDraft(),
    error: null,
    lastSyncNote: null,
  });
}

export function seedMarketingPreview(): void {
  const workspace = {
    id: MARKETING_PREVIEW_WORKSPACE_ID,
    name: "Design Team",
    accent: pickWorkspaceAccent(2),
    iconURL: null,
    ownerId: MARKETING_PREVIEW_USER_ID,
    ownerName: "Alex",
    createdAt: Date.now(),
  };

  useAuthStore.setState({
    ready: true,
    isAuthenticated: true,
    firebaseUid: MARKETING_PREVIEW_USER_ID,
    authEmail: "alex@demo.hall.app",
    authError: null,
    emailLinkSent: false,
  });

  useWorkspacesStore.setState({
    hydrated: true,
    customServers: [workspace],
    memberships: [
      {
        workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
        userId: MARKETING_PREVIEW_USER_ID,
        role: "owner",
        joinedAt: Date.now(),
      },
    ],
  });

  const manualNote = buildManualNoteSession();
  const { tabs, activeId, activeMessages } = buildAgentChatTabs();
  const chatSessions = [manualNote, ...tabs];

  useStore.setState({
    activeRoomId: MARKETING_PREVIEW_WORKSPACE_ID,
    userDisplayName: "Alex",
    chatPanelOpen: true,
    chatPanelMode: "agent",
    chatPanelExpanded: false,
    sidePanelSide: "right",
    subscriptionPlan: "pro",
    billingManaged: false,
    workspaceEnterpriseActive: false,
    llmEnabled: true,
    chat: activeMessages,
    openChatTabs: tabs,
    activeChatTabId: activeId,
    chatNavStack: tabs.map((tab) => tab.id),
    chatNavPointer: 0,
    chatSessions,
    activeManualNoteId: MARKETING_PREVIEW_NOTE_ID,
    showChatHistory: false,
    colorTheme: "dark",
  });

  useCallsStore.setState({
    callsByRoom: {
      [MARKETING_PREVIEW_WORKSPACE_ID]: buildRoomCallsState(),
    },
    theaterByWorkspace: {
      [MARKETING_PREVIEW_WORKSPACE_ID]: buildTheaterState(),
    },
    callsViewModeByWorkspace: {
      [MARKETING_PREVIEW_WORKSPACE_ID]: "blocks",
    },
  });

  seedPresence();
  seedPresenceActivities();
  seedConnectors();
  seedSpotifyPlayback();
  seedCalendar();
  seedPeopleThreads();
  seedFollowUp();
}

export function seedMarketingRecordingPreview(): void {
  seedMarketingPreview();

  useStore.setState({
    chatPanelOpen: false,
    chatPanelMode: "agent",
    chatPanelExpanded: false,
  });

  useCallsStore.setState({
    recording: false,
    recordingBusy: false,
    mediaError: null,
  });
}

export function seedMarketingTheaterPreview(): void {
  seedMarketingPreview();

  const theater = buildTheaterState(THEATER_PREVIEW_AUDIENCE_SIZE);

  useStore.setState({
    chatPanelOpen: false,
    chatPanelMode: "agent",
    chatPanelExpanded: false,
  });

  useCallsStore.setState({
    callsViewModeByWorkspace: {
      ...useCallsStore.getState().callsViewModeByWorkspace,
      [MARKETING_PREVIEW_WORKSPACE_ID]: "theater",
    },
    theaterByWorkspace: {
      ...useCallsStore.getState().theaterByWorkspace,
      [MARKETING_PREVIEW_WORKSPACE_ID]: {
        ...theater,
        handRaises: [
          {
            id: "preview-theater-hr-1",
            workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
            userId: "riley",
            userName: "Riley",
            status: "pending",
          },
          {
            id: "preview-theater-hr-2",
            workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
            userId: "casey",
            userName: "Casey",
            status: "pending",
          },
          {
            id: "preview-theater-hr-3",
            workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
            userId: "taylor",
            userName: "Taylor",
            status: "pending",
          },
        ],
      },
    },
    speakingByParticipant: {
      jordan: true,
      sam: false,
    },
  });
}
