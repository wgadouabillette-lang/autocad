import { create } from "zustand";
import {
  createPollOptionId,
  isPollExpired,
  pollExpiresAt,
  shouldShowPollToUser,
  VOICE_POLL_MIN_OPTIONS,
  type VoicePoll,
  type VoicePollOption,
} from "../lib/voicePoll";
import {
  closeWorkspacePoll,
  deleteWorkspacePoll,
  publishWorkspacePoll,
  voteWorkspacePoll,
} from "../lib/firebase/workspacePolls";
import { notifyWorkspaceOfPoll, dismissPollMemberNotification } from "../lib/voicePollNotifications";
import { useStore } from "./useStore";
import { useAuthStore } from "./useAuthStore";

interface VoicePollState {
  activePollByWorkspace: Record<string, VoicePoll | null>;
  composerOpenByWorkspace: Record<string, boolean>;
  votePanelOpenByWorkspace: Record<string, boolean>;

  isComposerOpen: (workspaceId: string) => boolean;
  isVotePanelOpen: (workspaceId: string) => boolean;
  getActivePoll: (workspaceId: string) => VoicePoll | null;
  ingestPoll: (poll: VoicePoll) => void;
  openComposer: (workspaceId: string) => void;
  closeComposer: (workspaceId: string) => void;
  openVotePanel: (workspaceId: string) => void;
  closeVotePanel: (workspaceId: string) => void;
  togglePollExperience: (workspaceId: string) => void;
  publishPoll: (
    workspaceId: string,
    question: string,
    subtitle: string,
    optionLabels: string[],
  ) => { ok: true } | { ok: false; error: string };
  vote: (workspaceId: string, optionId: string) => void;
  closePoll: (workspaceId: string) => void;
  resetPoll: (workspaceId: string) => void;
  expirePoll: (workspaceId: string) => void;
  clearWorkspace: (workspaceId: string) => void;
}

const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function currentUserId(): string {
  return useAuthStore.getState().firebaseUid ?? "local";
}

function currentUserName(): string {
  return useStore.getState().userDisplayName.trim() || "Membre";
}

function normalizeOptions(labels: string[]): VoicePollOption[] {
  return labels
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => ({ id: createPollOptionId(), label }));
}

function ensureChatPanelOpen(): void {
  const store = useStore.getState();
  if (!store.chatPanelOpen || store.chatPanelMode !== "agent") {
    store.openAgentPanel();
  }
}

function clearPollExpiryTimer(workspaceId: string): void {
  const timer = expiryTimers.get(workspaceId);
  if (!timer) return;
  clearTimeout(timer);
  expiryTimers.delete(workspaceId);
}

function schedulePollExpiry(workspaceId: string, expiresAt: number): void {
  clearPollExpiryTimer(workspaceId);
  const delay = Math.max(0, expiresAt - Date.now());
  const timer = setTimeout(() => {
    expiryTimers.delete(workspaceId);
    useVoicePollStore.getState().expirePoll(workspaceId);
  }, delay);
  expiryTimers.set(workspaceId, timer);
}

function purgeExpiredPollIfNeeded(
  workspaceId: string,
  poll: VoicePoll | null | undefined,
): VoicePoll | null {
  if (!poll) return null;
  if (!isPollExpired(poll)) return poll;
  useVoicePollStore.getState().expirePoll(workspaceId);
  return null;
}

export const useVoicePollStore = create<VoicePollState>((set, get) => ({
  activePollByWorkspace: {},
  composerOpenByWorkspace: {},
  votePanelOpenByWorkspace: {},

  isComposerOpen: (workspaceId) => get().composerOpenByWorkspace[workspaceId] ?? false,

  isVotePanelOpen: (workspaceId) => get().votePanelOpenByWorkspace[workspaceId] ?? false,

  getActivePoll: (workspaceId) => {
    const poll = get().activePollByWorkspace[workspaceId] ?? null;
    return purgeExpiredPollIfNeeded(workspaceId, poll);
  },

  ingestPoll: (poll) => {
    if (isPollExpired(poll)) return;

    const workspaceId = poll.workspaceId;
    const existing = get().activePollByWorkspace[workspaceId];
    if (existing?.id === poll.id) {
      set((state) => ({
        activePollByWorkspace: {
          ...state.activePollByWorkspace,
          [workspaceId]: {
            ...poll,
            votesByUserId: { ...existing.votesByUserId, ...poll.votesByUserId },
          },
        },
      }));
    } else {
      set((state) => ({
        activePollByWorkspace: { ...state.activePollByWorkspace, [workspaceId]: poll },
      }));
    }

    schedulePollExpiry(workspaceId, poll.expiresAt);

    const userId = useAuthStore.getState().firebaseUid;
    if (userId && !shouldShowPollToUser(poll, userId)) {
      get().closeVotePanel(workspaceId);
    }
  },

  openComposer: (workspaceId) => {
    ensureChatPanelOpen();
    set((state) => ({
      composerOpenByWorkspace: { ...state.composerOpenByWorkspace, [workspaceId]: true },
      votePanelOpenByWorkspace: { ...state.votePanelOpenByWorkspace, [workspaceId]: false },
    }));
  },

  closeComposer: (workspaceId) => {
    set((state) => ({
      composerOpenByWorkspace: { ...state.composerOpenByWorkspace, [workspaceId]: false },
    }));
  },

  openVotePanel: (workspaceId) => {
    const poll = get().getActivePoll(workspaceId);
    const userId = useAuthStore.getState().firebaseUid;
    if (!poll || !shouldShowPollToUser(poll, userId)) return;
    ensureChatPanelOpen();
    set((state) => ({
      votePanelOpenByWorkspace: { ...state.votePanelOpenByWorkspace, [workspaceId]: true },
      composerOpenByWorkspace: { ...state.composerOpenByWorkspace, [workspaceId]: false },
    }));
  },

  closeVotePanel: (workspaceId) => {
    set((state) => ({
      votePanelOpenByWorkspace: { ...state.votePanelOpenByWorkspace, [workspaceId]: false },
    }));
  },

  togglePollExperience: (workspaceId) => {
    const poll = get().getActivePoll(workspaceId);
    const userId = useAuthStore.getState().firebaseUid;
    const visiblePoll =
      poll && shouldShowPollToUser(poll, userId) ? poll : null;
    const composing = get().isComposerOpen(workspaceId);
    const voting = get().isVotePanelOpen(workspaceId);

    if (composing || voting) {
      get().closeComposer(workspaceId);
      get().closeVotePanel(workspaceId);
      return;
    }

    if (visiblePoll) {
      get().openVotePanel(workspaceId);
      return;
    }

    get().openComposer(workspaceId);
  },

  publishPoll: (workspaceId, question, subtitle, optionLabels) => {
    const trimmedQuestion = question.trim();
    const trimmedSubtitle = subtitle.trim();
    if (!trimmedQuestion) {
      return { ok: false, error: "Ajoutez un titre." };
    }

    const options = normalizeOptions(optionLabels);
    if (options.length < VOICE_POLL_MIN_OPTIONS) {
      return { ok: false, error: "Remplissez au moins deux choix." };
    }

    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (!firebaseUid) {
      return { ok: false, error: "Connectez-vous pour publier un sondage." };
    }

    const createdAt = Date.now();
    const poll: VoicePoll = {
      id: `poll-${createdAt}`,
      workspaceId,
      question: trimmedQuestion,
      subtitle: trimmedSubtitle,
      options,
      votesByUserId: {},
      createdByUserId: firebaseUid,
      createdByName: currentUserName(),
      status: "open",
      createdAt,
      expiresAt: pollExpiresAt(createdAt),
    };

    notifyWorkspaceOfPoll(poll);
    schedulePollExpiry(workspaceId, poll.expiresAt);

    set((state) => ({
      activePollByWorkspace: { ...state.activePollByWorkspace, [workspaceId]: poll },
      composerOpenByWorkspace: { ...state.composerOpenByWorkspace, [workspaceId]: false },
      votePanelOpenByWorkspace: { ...state.votePanelOpenByWorkspace, [workspaceId]: true },
    }));

    void publishWorkspacePoll(poll).catch(() => {
      get().resetPoll(workspaceId);
    });

    return { ok: true };
  },

  vote: (workspaceId, optionId) => {
    const poll = get().getActivePoll(workspaceId);
    const voterUid = currentUserId();
    if (!poll || poll.status !== "open") return;
    if (poll.votesByUserId[voterUid]) return;
    if (!poll.options.some((option) => option.id === optionId)) return;

    set((state) => ({
      activePollByWorkspace: {
        ...state.activePollByWorkspace,
        [workspaceId]: {
          ...poll,
          votesByUserId: { ...poll.votesByUserId, [voterUid]: optionId },
        },
      },
    }));

    if (poll.createdByUserId !== voterUid) {
      get().closeVotePanel(workspaceId);
      dismissPollMemberNotification(poll.id);
    }

    if (useAuthStore.getState().firebaseUid) {
      void voteWorkspacePoll(workspaceId, voterUid, optionId).catch(() => {});
    }
  },

  closePoll: (workspaceId) => {
    const poll = get().getActivePoll(workspaceId);
    if (!poll) return;

    set((state) => ({
      activePollByWorkspace: {
        ...state.activePollByWorkspace,
        [workspaceId]: { ...poll, status: "closed" },
      },
    }));

    void closeWorkspacePoll(workspaceId).catch(() => {});
  },

  resetPoll: (workspaceId) => {
    clearPollExpiryTimer(workspaceId);
    set((state) => ({
      activePollByWorkspace: { ...state.activePollByWorkspace, [workspaceId]: null },
      votePanelOpenByWorkspace: { ...state.votePanelOpenByWorkspace, [workspaceId]: false },
    }));
    void deleteWorkspacePoll(workspaceId).catch(() => {});
  },

  expirePoll: (workspaceId) => {
    clearPollExpiryTimer(workspaceId);
    set((state) => ({
      activePollByWorkspace: { ...state.activePollByWorkspace, [workspaceId]: null },
      votePanelOpenByWorkspace: { ...state.votePanelOpenByWorkspace, [workspaceId]: false },
      composerOpenByWorkspace: { ...state.composerOpenByWorkspace, [workspaceId]: false },
    }));
    void deleteWorkspacePoll(workspaceId).catch(() => {});
  },

  clearWorkspace: (workspaceId) => {
    clearPollExpiryTimer(workspaceId);
    set((state) => {
      const activePollByWorkspace = { ...state.activePollByWorkspace };
      const composerOpenByWorkspace = { ...state.composerOpenByWorkspace };
      const votePanelOpenByWorkspace = { ...state.votePanelOpenByWorkspace };
      delete activePollByWorkspace[workspaceId];
      delete composerOpenByWorkspace[workspaceId];
      delete votePanelOpenByWorkspace[workspaceId];
      return { activePollByWorkspace, composerOpenByWorkspace, votePanelOpenByWorkspace };
    });
  },
}));
