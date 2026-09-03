import type { CallBlock, OpenVoiceChannel, RoomCallsState } from "./calls";
import { memberBlockId } from "./calls";
import {
  MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL,
  MARKETING_PREVIEW_NOTE_ID,
  MARKETING_PREVIEW_STARBOY_COVER_URL,
  MARKETING_PREVIEW_USER_ID,
  MARKETING_PREVIEW_WORKSPACE_ID,
  readMarketingPreviewRecordingActiveParam,
} from "./marketingPreview";
import {
  THEATER_BENCH_COUNT,
  THEATER_BENCH_SEAT_COUNT,
  type TheaterState,
} from "./theater";
import type { ChatMessage, ChatSession } from "../store/useStore";
import type { CalendarEvent } from "../store/useCalendarStore";
import type { FollowUpDraft } from "./followUps";
import { useAuthStore } from "../store/useAuthStore";
import { useCallsStore } from "../store/useCallsStore";
import { useConnectorsStore } from "../store/useConnectorsStore";
import { useFollowUpCaptureStore } from "../store/useFollowUpCaptureStore";
import { useFollowUpsStore } from "../store/useFollowUpsStore";
import { useHallDjStore } from "../store/useHallDjStore";
import { useHandoffStore } from "../store/useHandoffStore";
import { useStore } from "../store/useStore";
import {
  PRESENCE_OFFLINE_AFTER_MS,
  useWorkspacePresenceStore,
} from "../store/useWorkspacePresenceStore";
import { useWorkspacesStore } from "../store/useWorkspacesStore";
import { useWorkspaceTextChannelsStore } from "../store/useWorkspaceTextChannelsStore";
import { useCalendarOverlayStore } from "../store/useCalendarOverlayStore";
import { useCalendarStore } from "../store/useCalendarStore";
import { usePeopleStore } from "../store/usePeopleStore";
import { usePresenceActivityStore } from "../store/usePresenceActivityStore";
import { useNotificationsStore } from "../store/useNotificationsStore";
import { useSpotifyPlayerStore } from "../store/useSpotifyPlayerStore";
import { CHAT_CONNECTORS, isConnectorComingSoon } from "../components/chat/chatConnectors";
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

/** Activities on side tiles only (open-channel members are hidden from the grid). */
const PREVIEW_PRESENCE_ACTIVITIES: Record<string, PresenceActivityId> = {
  casey: "claude",
  taylor: "openai",
  elena: "spotify",
  noah: "claude",
  zoe: "openai",
  chris: "spotify",
  lena: "calendar",
  omar: "claude",
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

const THEATER_SPEAKER_COUNT = 1;
const THEATER_AUDIENCE_SIZE = 7;
const THEATER_PREVIEW_AUDIENCE_SIZE = 48;

const PREVIEW_NOTE_BODY_HTML = [
  "<h1>Q3 planning — wrap-up</h1>",
  "<p>Call ended 2 min ago · 32 min · Alex, Jordan, Sam, Riley</p>",
  "<h2>Decisions</h2>",
  "<ul>",
  "<li>Ship <strong>calendar two-way sync</strong> in sprint 14</li>",
  "<li>Keep the voice lounge as the default workspace home</li>",
  "<li>Defer Theater recording until September</li>",
  "</ul>",
  "<h2>Action items</h2>",
  "<p><mark>Jordan</mark> — Gmail connector QA by Wednesday.</p>",
  "<p><mark>Sam</mark> — polish the Notes empty state before Friday’s demo.</p>",
  "<p><mark>Riley</mark> — send this recap to leadership and book the follow-up.</p>",
  "<h2>Next</h2>",
  "<p>Thursday 10:00 — standup in Salon vocal. Lock the sprint 14 board before then.</p>",
].join("");

const LANDING_HERO_NOTE_TITLE = "Design review";
const LANDING_HERO_NOTE_HTML = [
  "<h2>Context</h2>",
  "<p>Design review in Salon vocal with You, Jordan, Sam, Riley, and Morgan. Goal is to lock the dashboard layout and connector order before sprint 14.</p>",
  "<h2>Decisions</h2>",
  "<ul>",
  "<li>Keep Salon vocal as the default workspace home.</li>",
  "<li>Ship calendar two-way sync in <mark>sprint 14</mark>.</li>",
  "<li>Landing preview must show the real workspace shell, not a static mock.</li>",
  "</ul>",
  "<h2>Connectors</h2>",
  "<p>Jordan is mid-OAuth review. Gmail is still the blocker; Calendar should land first if the redirect URLs stay clean.</p>",
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
  "<li><strong>Morgan</strong> — check the five-person voice grid on the landing cut.</li>",
  "</ul>",
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
  "<h2>Parking lot</h2>",
  "<p>Morgan will re-cut the five-person salon still if the mute badge on Sam is hard to read at landing scale.</p>",
  "<p>Riley drafts the leadership one-pager after this call. Include the connector table if Gmail is still pending.</p>",
  "<p>You send the recap in Notes history so the recording and the structured note stay on the same thread.</p>",
].join("");

const LANDING_HERO_BLINDING_LIGHTS = {
  id: "0VjIjW4GlUZAMYd2vXMi3b",
  name: "Blinding Lights",
  artists: "The Weeknd",
  album: "After Hours",
  url: "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b",
  imageUrl: MARKETING_PREVIEW_BLINDING_LIGHTS_COVER_URL,
  durationMs: 200040,
};

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
  const openChannelId = `${MARKETING_PREVIEW_WORKSPACE_ID}-open-main`;
  const blocks: CallBlock[] = [
    memberBlock("local", LOCAL_USER.name, false),
    ...DEMO_MEMBERS.map((member) => memberBlock(member.id, member.name, false)),
  ];

  const openChannels: OpenVoiceChannel[] = [
    {
      id: openChannelId,
      roomId: MARKETING_PREVIEW_WORKSPACE_ID,
      name: "Salon vocal",
      participants: [],
      inCall: false,
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
  pendingPrompt: string;
} {
  const pendingPrompt =
    "Can you also list the open action items from that review?";
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
        {
          role: "user",
          text: pendingPrompt,
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
          text: "Connect your tools once — play music, schedule meetings, and draft emails without leaving Meetra.",
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
    pendingPrompt,
  };
}

function buildManualNoteSession(): ChatSession {
  return {
    id: MARKETING_PREVIEW_NOTE_ID,
    title: "Q3 planning — 17 Aug",
    messages: [{ role: "user", text: PREVIEW_NOTE_BODY_HTML }],
    updatedAt: Date.now() - 2 * 60_000,
    kind: "note",
    manualNoteTitle: "Q3 planning — 17 Aug",
    manualNoteBody: PREVIEW_NOTE_BODY_HTML,
  };
}

function buildPreviewCalendarEvents(today: string): CalendarEvent[] {
  const nextWeekDate = new Date(`${today}T12:00:00`);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeek = toDateKey(nextWeekDate);
  return [
    {
      id: "preview-cal-1",
      dateKey: today,
      startMinutes: 8 * 60,
      endMinutes: 8 * 60 + 30,
      title: "Team standup",
      detail: "Design Team · Salon vocal",
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
    {
      id: "preview-cal-next-1",
      dateKey: nextWeek,
      startMinutes: 9 * 60,
      endMinutes: 9 * 60 + 30,
      title: "Team standup",
      detail: "Design Team",
      source: "google",
      googleEventId: "preview-g-next-1",
    },
    {
      id: "preview-cal-next-2",
      dateKey: nextWeek,
      startMinutes: 11 * 60,
      endMinutes: 11 * 60 + 45,
      title: "Riley · 1:1",
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
      online: boolean;
      voice: { inPrivateCall: boolean; openChannelId: string | null };
    }
  > = {};

  for (const member of DEMO_MEMBERS) {
    const isOffline = OFFLINE_MEMBER_IDS.has(member.id);
    members[member.id] = {
      displayName: member.name,
      lastSeenMs: isOffline ? now - PRESENCE_OFFLINE_AFTER_MS - 60_000 : now,
      online: !isOffline,
      voice: {
        inPrivateCall: false,
        openChannelId: null,
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
  const accountById: Partial<Record<string, string>> = {
    calendar: "Alex",
    spotify: "Alex",
    gmail: "alex@demo.hall.app",
    outlook: "Alex",
  };
  useConnectorsStore.setState({
    statuses: CHAT_CONNECTORS.map(({ id, label }) => {
      const comingSoon = isConnectorComingSoon(id);
      return {
        id,
        label,
        provider: id,
        connected: !comingSoon,
        configured: !comingSoon,
        accountLabel: comingSoon ? undefined : accountById[id],
      };
    }),
    statusSource: "visual",
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
    currentTrack: null,
    lastPlayedTrack: null,
    queue: [],
    history: [],
    playing: false,
    playbackMode: null,
    premiumAvailable: true,
    streamingScopeAvailable: true,
    playerNotice: null,
    queueAddFlashAt: 0,
  });
}

function seedHallDj(): void {
  useHallDjStore.setState({
    active: false,
    loading: false,
    error: null,
    feedbackResolvedTrackId: null,
    feedbackBusy: false,
  });
}

function seedWorkspaceTextChannels(): void {
  useWorkspaceTextChannelsStore.setState({
    channelsByWorkspace: {
      [MARKETING_PREVIEW_WORKSPACE_ID]: [
        {
          id: `${MARKETING_PREVIEW_WORKSPACE_ID}-general`,
          workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
          name: "general",
        },
        {
          id: `${MARKETING_PREVIEW_WORKSPACE_ID}-design`,
          workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
          name: "design",
        },
        {
          id: `${MARKETING_PREVIEW_WORKSPACE_ID}-standup`,
          workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
          name: "standup",
        },
      ],
    },
    renamingChannel: null,
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
        ? "Tu peux rejoindre le salon vocal ?"
        : index === 1
          ? "J’ai partagé le mockup du dashboard."
          : index === 2
            ? "Le calendrier est chargé aujourd’hui."
            : "J’arrive.",
    updatedAt: now - index * 120_000,
    unread: index === 0 ? 1 : index === 2 ? 1 : 0,
    messages: [
      {
        id: `preview-msg-${member.id}`,
        author: member.name,
        authorUid: member.id,
        text:
          index === 0
            ? "Tu peux rejoindre le salon vocal ?"
            : index === 1
              ? "J’ai partagé le mockup du dashboard."
              : index === 2
                ? "Le calendrier est chargé aujourd’hui — toujours OK pour 15h ?"
                : "J’arrive.",
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
  const emptyAgentTab = {
    id: "preview-chat-empty",
    title: "New",
    messages: [],
    updatedAt: Date.now(),
    kind: "discussion" as const,
  };

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
    chat: [],
    openChatTabs: [emptyAgentTab],
    activeChatTabId: emptyAgentTab.id,
    chatNavStack: [emptyAgentTab.id],
    chatNavPointer: 0,
    chatSessions: [manualNote],
    activeManualNoteId: MARKETING_PREVIEW_NOTE_ID,
    showChatHistory: false,
    colorTheme: "dark",
    aiModel: "claude-opus-4-7",
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
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
  seedHallDj();
  seedWorkspaceTextChannels();
  seedCalendar();
  seedPeopleThreads();
  seedFollowUp();
}

const LANDING_HERO_LISTENER_COUNT = 24;

function landingHeroAudienceMembers(): { id: string; name: string }[] {
  const seen = new Set(["local", "jordan"]);
  const members: { id: string; name: string }[] = [];
  for (const member of [
    { id: "sam", name: "Sam" },
    { id: "riley", name: "Riley" },
    { id: "morgan", name: "Morgan" },
    ...DEMO_MEMBERS,
    ...THEATER_AUDIENCE_EXTRA,
  ]) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    members.push({ id: member.id, name: member.name });
    if (members.length >= LANDING_HERO_LISTENER_COUNT) break;
  }
  return members;
}

function scatterAudienceSeats(ids: string[]): Record<string, number> {
  const seats: Record<string, number> = {};
  ids.forEach((id, index) => {
    const bench = index % THEATER_BENCH_COUNT;
    const slot = Math.floor(index / THEATER_BENCH_COUNT);
    seats[id] = bench * THEATER_BENCH_SEAT_COUNT + slot;
  });
  return seats;
}

function buildLandingHeroTheaterState(): TheaterState {
  const speakers = [
    { ...LOCAL_USER, role: "speaker" as const },
    { id: "jordan", name: "Jordan", role: "speaker" as const },
  ];
  const audience = landingHeroAudienceMembers().map((member) => ({
    ...member,
    role: "audience" as const,
  }));
  return {
    workspaceId: MARKETING_PREVIEW_WORKSPACE_ID,
    speakers,
    audience,
    audienceSeatByUserId: scatterAudienceSeats(audience.map((member) => member.id)),
    question: null,
    handRaises: [],
    localRole: "speaker",
  };
}

/** Frozen landing hero: Theater (2 speakers + benches), AI Notes, recording toast. */
export function seedMarketingLandingHero(): void {
  seedMarketingPreview();

  const recordingId = "preview-rec-landing";
  const recordedAt = Date.now() - 90_000;

  useCallsStore.setState((state) => {
    const room = state.callsByRoom[MARKETING_PREVIEW_WORKSPACE_ID];
    return {
      localInCallByRoom: {
        ...state.localInCallByRoom,
        [MARKETING_PREVIEW_WORKSPACE_ID]: false,
      },
      localOpenChannelByRoom: {
        ...state.localOpenChannelByRoom,
        [MARKETING_PREVIEW_WORKSPACE_ID]: null,
      },
      muted: false,
      mutedByParticipant: { ...state.mutedByParticipant, sam: true },
      recording: false,
      recordingBusy: false,
      mediaError: null,
      callsViewModeByWorkspace: {
        ...state.callsViewModeByWorkspace,
        [MARKETING_PREVIEW_WORKSPACE_ID]: "theater",
      },
      theaterByWorkspace: {
        ...state.theaterByWorkspace,
        [MARKETING_PREVIEW_WORKSPACE_ID]: buildLandingHeroTheaterState(),
      },
      callsByRoom: room
        ? {
            ...state.callsByRoom,
            [MARKETING_PREVIEW_WORKSPACE_ID]: {
              ...room,
              openChannels: room.openChannels.map((channel) => ({
                ...channel,
                inCall: false,
                participants: channel.participants.filter((person) => !person.isLocal),
              })),
            },
          }
        : state.callsByRoom,
    };
  });

  useStore.setState((state) => ({
    chatPanelOpen: true,
    chatPanelMode: "ai-notes",
    chatPanelExpanded: false,
    chatPanelLeaveAnimating: false,
    showChatHistory: false,
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
    activeManualNoteId: MARKETING_PREVIEW_NOTE_ID,
    chatSessions: [
      {
        id: MARKETING_PREVIEW_NOTE_ID,
        title: LANDING_HERO_NOTE_TITLE,
        messages: [{ role: "user" as const, text: LANDING_HERO_NOTE_HTML }],
        updatedAt: Date.now(),
        kind: "note" as const,
        manualNoteTitle: LANDING_HERO_NOTE_TITLE,
        manualNoteBody: LANDING_HERO_NOTE_HTML,
      },
      {
        id: recordingId,
        title: "Recording 30 Aug, 3:12 PM",
        messages: [],
        updatedAt: recordedAt,
        kind: "recording" as const,
        recordingId,
        durationMs: 4000,
      },
      ...state.chatSessions.filter(
        (session) => session.id !== MARKETING_PREVIEW_NOTE_ID && session.id !== recordingId,
      ),
    ],
  }));

  useNotificationsStore.setState({
    items: [
      {
        id: "n-preview-rec-landing",
        kind: "recording",
        category: "Recordings",
        title: "Recording saved",
        body: "Available in your notes history.",
        recordingSessionId: recordingId,
        createdAt: recordedAt,
        read: false,
      },
    ],
    panelOpen: true,
    panelOpenGeneration: 1,
    currentIndex: 0,
  });

  useHallDjStore.setState({
    active: true,
    loading: false,
    error: null,
    feedbackResolvedTrackId: null,
    feedbackBusy: false,
  });
  useSpotifyPlayerStore.setState({
    currentTrack: LANDING_HERO_BLINDING_LIGHTS,
    lastPlayedTrack: null,
    playing: true,
    playbackMode: "full",
    playerNotice: null,
    panelOpen: false,
    premiumAvailable: true,
    streamingScopeAvailable: true,
  });
}

export function seedMarketingRecordingPreview(): void {
  seedMarketingPreview();

  useStore.setState({
    chatPanelOpen: false,
    chatPanelMode: "agent",
    chatPanelExpanded: false,
  });

  useCallsStore.setState({
    recording: readMarketingPreviewRecordingActiveParam(),
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

/** Duo salon call with bottom dock (Follow-up active) for the landing card crop. */
export function seedMarketingFollowUpPreview(): void {
  seedMarketingPreview();

  useStore.setState({
    chatPanelOpen: false,
    chatPanelMode: "agent",
    chatPanelExpanded: false,
    chatPanelLeaveAnimating: false,
    showChatHistory: false,
    billingManaged: true,
  });

  const workspaceId = MARKETING_PREVIEW_WORKSPACE_ID;
  const salonChannelId = `${workspaceId}-open-main`;
  const salonLocal = { id: "local", name: "You", isLocal: true as const };
  const salonParticipants = [salonLocal, { id: "jordan", name: "Jordan" }];
  const salonMemberIds = ["jordan"];

  useFollowUpCaptureStore.setState({
    active: true,
    busy: false,
    transcriptLines: [],
    workspaceId,
    captureId: "preview-followup-capture",
  });

  const now = Date.now();
  useWorkspacePresenceStore.setState((state) => {
    const existing = state.membersByWorkspace[workspaceId] ?? {};
    const members = { ...existing };
    for (const memberId of salonMemberIds) {
      const member = members[memberId];
      if (!member) continue;
      members[memberId] = {
        ...member,
        lastSeenMs: now,
        online: true,
        voice: {
          inPrivateCall: false,
          openChannelId: salonChannelId,
        },
      };
    }
    return {
      membersByWorkspace: {
        ...state.membersByWorkspace,
        [workspaceId]: members,
      },
    };
  });

  useCallsStore.setState((state) => {
    const room = state.callsByRoom[workspaceId];
    if (!room) return state;
    return {
      localInCallByRoom: { ...state.localInCallByRoom, [workspaceId]: true },
      localOpenChannelByRoom: { ...state.localOpenChannelByRoom, [workspaceId]: salonChannelId },
      mutedByParticipant: { ...state.mutedByParticipant },
      speakingByParticipant: { jordan: true },
      callsViewModeByWorkspace: {
        ...state.callsViewModeByWorkspace,
        [workspaceId]: "blocks",
      },
      callsByRoom: {
        ...state.callsByRoom,
        [workspaceId]: {
          ...room,
          openChannels: room.openChannels.map((channel) =>
            channel.id === salonChannelId
              ? {
                  ...channel,
                  inCall: true,
                  participants: salonParticipants,
                }
              : channel,
          ),
        },
      },
    };
  });
}

/** Full app chrome with the Notes tab open on a just-finished meeting. */
export function seedMarketingNotesPreview(): void {
  seedMarketingPreview();

  const people = usePeopleStore.getState();
  const clearUnread = <T extends { unread: number }>(threads: T[]): T[] =>
    threads.map((thread) => ({ ...thread, unread: 0 }));

  usePeopleStore.setState({
    friendThreads: clearUnread(people.friendThreads),
    groupThreads: clearUnread(people.groupThreads),
    colleagueThreadsByWorkspace: Object.fromEntries(
      Object.entries(people.colleagueThreadsByWorkspace).map(([id, threads]) => [
        id,
        clearUnread(threads),
      ]),
    ),
    friendsTabSeenAt: Date.now(),
  });

  useStore.setState({
    chatPanelOpen: true,
    chatPanelMode: "ai-notes",
    chatPanelExpanded: true,
    chatPanelLeaveAnimating: false,
    activeManualNoteId: MARKETING_PREVIEW_NOTE_ID,
    showChatHistory: false,
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
  });
}

const HANDOFF_PREVIEW_CHAT_ID = "preview-chat-handoff";
const HANDOFF_PREVIEW_MESSAGES: ChatMessage[] = [
  {
    role: "user",
    text: "Create a one-pager I can hand off to Jordan for the Q3 launch.",
  },
  {
    role: "assistant",
    text: [
      "# Q3 launch one-pager",
      "",
      "File ready — calendar sync, voice lounge, and the Thursday review.",
      "",
      "## Goal",
      "Ship **calendar two-way sync** in sprint 14. Keep the voice lounge as the default workspace home.",
      "",
      "## Owners",
      "- Jordan — Gmail connector QA by Wednesday",
      "- Sam — Notes empty state before Friday’s demo",
      "- Riley — recap to leadership and book the follow-up",
      "",
      "## Next",
      "Thursday 10:00 standup in Salon vocal. Lock the sprint 14 board before then.",
    ].join("\n"),
  },
  {
    role: "user",
    text: "Also flag Jordan’s Wednesday QA deadline and the Thursday standup.",
  },
];

/** Agent tab with a Q3 one-pager ready — cursor demo types /handoff to start selection. */
export function seedMarketingHandoffPreview(): void {
  seedMarketingPreview();

  const handoffTab = buildDiscussionTab(
    HANDOFF_PREVIEW_CHAT_ID,
    "Q3 launch one-pager",
    HANDOFF_PREVIEW_MESSAGES,
    90_000,
  );
  const { tabs } = buildAgentChatTabs();
  const openChatTabs = [handoffTab, ...tabs.filter((tab) => tab.id !== "preview-chat-design")];

  const people = usePeopleStore.getState();
  const clearUnread = <T extends { unread: number }>(threads: T[]): T[] =>
    threads.map((thread) => ({ ...thread, unread: 0 }));

  usePeopleStore.setState({
    friendThreads: clearUnread(people.friendThreads),
    groupThreads: clearUnread(people.groupThreads),
    colleagueThreadsByWorkspace: Object.fromEntries(
      Object.entries(people.colleagueThreadsByWorkspace).map(([id, threads]) => [
        id,
        clearUnread(threads),
      ]),
    ),
    friendsTabSeenAt: Date.now(),
  });

  const now = Date.now();
  const handoffMembers = [
    { id: "jordan", name: "Jordan" },
    { id: "sam", name: "Sam" },
    { id: "riley", name: "Riley" },
    { id: "clara", name: "Clara" },
  ];
  useWorkspacePresenceStore.setState({
    loadedByWorkspace: { [MARKETING_PREVIEW_WORKSPACE_ID]: true },
    membersByWorkspace: {
      [MARKETING_PREVIEW_WORKSPACE_ID]: Object.fromEntries(
        handoffMembers.map((member) => [
          member.id,
          {
            displayName: member.name,
            lastSeenMs: now,
            online: true,
            voice: { inPrivateCall: false, openChannelId: null },
          },
        ]),
      ),
    },
  });

  useStore.setState({
    chatPanelOpen: true,
    chatPanelMode: "agent",
    chatPanelExpanded: false,
    chatPanelLeaveAnimating: false,
    showChatHistory: false,
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
    chat: structuredClone(HANDOFF_PREVIEW_MESSAGES),
    openChatTabs,
    activeChatTabId: HANDOFF_PREVIEW_CHAT_ID,
    chatNavStack: openChatTabs.map((tab) => tab.id),
    chatNavPointer: 0,
    chatSessions: [
      ...(useStore.getState().chatSessions.filter((session) => session.kind === "note") ?? []),
      ...openChatTabs,
    ],
  });

  // Idle chat — handoff selection starts from the cursor demo typing /handoff.
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
}

const SPOTIFY_PREVIEW_STARBOY = {
  id: "7MXVkk9YMctZqd1Srtv4MB",
  name: "Starboy (feat. Daft Punk)",
  artists: "The Weeknd",
  album: "Starboy",
  url: "https://open.spotify.com/track/7MXVkk9YMctZqd1Srtv4MB",
  imageUrl: MARKETING_PREVIEW_STARBOY_COVER_URL,
  durationMs: 230453,
};

/** Same workspace as the hero, with Spotify idle until /play. */
export function seedMarketingSpotifyPreview(): void {
  seedMarketingPreview();

  const { chat, openChatTabs, activeChatTabId } = useStore.getState();
  const dropPendingPrompt = <T extends { role: string }>(messages: T[]): T[] => {
    const last = messages[messages.length - 1];
    return last?.role === "user" ? messages.slice(0, -1) : messages;
  };
  const nextChat = dropPendingPrompt(chat);
  const nextTabs = openChatTabs.map((tab) =>
    tab.id === activeChatTabId ? { ...tab, messages: dropPendingPrompt(tab.messages) } : tab,
  );

  useSpotifyPlayerStore.setState({
    currentTrack: null,
    lastPlayedTrack: null,
    playing: false,
    playbackMode: null,
    playerNotice: null,
    panelOpen: false,
  });

  useStore.setState({
    busy: false,
    activeAiRequests: 0,
    aiRun: null,
    chat: nextChat,
    openChatTabs: nextTabs,
  });
}
