import { create } from "zustand";
import {
  DEFAULT_LAST_SPOKE_AT,
  DEFAULT_PARTICIPANT_MEDIA,
  type ParticipantMediaState,
} from "../lib/callMediaFeeds";
import {
  canRequestJoin,
  createDraftOpenChannel,
  createRoomCallsState,
  isOpenChannelIdleExpired,
  mapOpenChannelsVacancy,
  syncOpenChannelVacancy,
  applyRemoteVoiceFromPresence,
  findLocalBlock,
  findLocalSoloBlock,
  memberBlockId,
  mergeCallBlocks,
  mergePresenceMemberBlocks,
  memberBlocksSignature,
  openChannelsSignature,
  removeDuplicateRemoteSelfBlocks,
  splitLocalFromBlock,
  syncRoomCallsWithMembers,
  type JoinRequest,
  type RoomCallsState,
} from "../lib/calls";
import {
  cancelVoiceKnock,
  respondVoiceKnock,
  sendVoiceKnock,
} from "../lib/firebase/workspaceVoiceKnocks";
import {
  pushWorkspaceVoiceState,
  type WorkspaceVoicePresence,
} from "../lib/firebase/workspacePresence";
import type { RemoteParticipantStreams } from "../lib/webrtc/workspaceVoiceRtc";
import {
  acquireLocalMedia,
  disableCamera,
  enableCamera,
  getLocalMediaStream,
  hasLocalMediaStream,
  setMicrophoneEnabled,
  stopLocalMedia,
} from "../lib/localMedia";
import { startScreenShare, stopScreenShare } from "../lib/screenShareMedia";
import {
  playScreenShareStartSound,
  playScreenShareStopSound,
  playVoiceJoinSound,
  playVoiceLeaveSound,
  playVoiceMuteSound,
  playVoiceUnmuteSound,
} from "../lib/voiceChannelSounds";
import { useWorkspacesStore } from "./useWorkspacesStore";
import { useAuthStore } from "./useAuthStore";
import { useWorkspacePresenceStore } from "./useWorkspacePresenceStore";
import { debugLog } from "../lib/debugLog";
import { useAiNotesStore } from "./useAiNotesStore";
import { useFollowUpCaptureStore } from "./useFollowUpCaptureStore";
import { useStore } from "./useStore";
import {
  canLocalRaiseHand,
  canLocalSpeak,
  createTheaterState,
  isLocalInTheater,
  LOCAL_USER,
  syncTheaterWithMembers,
  type HandRaiseRequest,
  type TheaterState,
} from "../lib/theater";

interface CallControls {
  muted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  recording: boolean;
  recordingBusy: boolean;
  pushToTalk: boolean;
  raiseHand: boolean;
  deafen: boolean;
  muteOthers: boolean;
  mediaError: string | null;
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
}

export type CallsViewMode = "blocks" | "theater";

interface CallsState extends CallControls {
  callsByRoom: Record<string, RoomCallsState>;
  localInCallByRoom: Record<string, boolean>;
  localOpenChannelByRoom: Record<string, string | null>;
  theaterByWorkspace: Record<string, TheaterState>;
  callsViewModeByWorkspace: Record<string, CallsViewMode>;
  participantMediaById: Record<string, ParticipantMediaState>;
  remoteMediaByUid: Record<string, RemoteParticipantStreams>;
  lastSpokeAtByParticipant: Record<string, number>;
  speakingByParticipant: Record<string, boolean>;

  ensureRoom: (workspaceId: string) => void;
  syncPresenceMembers: (
    workspaceId: string,
    members: Array<{
      id: string;
      name: string;
      photoURL?: string;
      voice?: WorkspaceVoicePresence;
    }>,
    localFirebaseUid?: string | null,
  ) => void;
  syncRemoteJoinRequests: (workspaceId: string, pending: JoinRequest[]) => void;
  completeRemoteKnockJoin: (workspaceId: string, partnerUid: string) => Promise<void>;
  clearJoinRequest: (workspaceId: string, requestId: string) => void;
  syncLocalParticipantProfile: (profile: {
    photoURL?: string | null;
    displayName?: string;
  }) => void;
  startOpenChannelDraft: (roomId: string) => void;
  confirmOpenChannel: (roomId: string, channelId: string, name: string) => void;
  removeOpenChannel: (roomId: string, channelId: string) => void;
  purgeIdleOpenChannels: () => void;
  kickMember: (roomId: string, blockId: string) => void;
  joinOpenChannel: (roomId: string, channelId: string) => void;
  prefetchVoiceMedia: () => Promise<void>;
  getCallsViewMode: (workspaceId: string) => CallsViewMode;
  openTheaterView: (workspaceId: string) => void;
  closeTheaterView: (workspaceId: string) => void;
  getTheater: (workspaceId: string) => TheaterState;
  joinTheater: (workspaceId: string, asSpeaker?: boolean) => void;
  leaveTheater: (workspaceId: string) => void;
  isLocalInTheaterCall: (workspaceId: string) => boolean;
  toggleTheaterRaiseHand: (workspaceId: string) => void;
  toggleBlockRaiseHand: (workspaceId: string) => void;
  acceptHandRaise: (workspaceId: string, requestId: string) => void;
  declineHandRaise: (workspaceId: string, requestId: string) => void;
  cancelHandRaise: (workspaceId: string, requestId: string) => void;
  endQuestion: (workspaceId: string) => void;
  canSpeakInTheater: (workspaceId: string) => boolean;
  requestJoin: (roomId: string, toBlockId: string) => void;
  acceptJoin: (roomId: string, requestId: string) => void;
  declineJoin: (roomId: string, requestId: string) => void;
  cancelJoin: (roomId: string, requestId: string) => void;
  joinCall: (roomId: string, options?: { markLocalBlockInCall?: boolean }) => Promise<void>;
  leaveCall: (workspaceId: string) => void;
  leaveGroupCall: (roomId: string) => void;
  isLocalInCall: (workspaceId: string) => boolean;
  togglePushToTalk: () => void;
  toggleDeafen: () => void;
  toggleMuteOthers: () => void;
  startLocalMedia: () => Promise<void>;
  stopLocalMediaTracks: () => void;
  toggleMuted: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  toggleRecording: () => Promise<void>;
  handleRecordingStreamEnded: () => Promise<void>;
  handleRecordingCaptureLost: () => Promise<void>;
  getRoomCalls: (roomId: string) => RoomCallsState;
  markParticipantVoiceActivity: (participantId: string, speaking: boolean) => void;
  setRemoteParticipantMedia: (uid: string, media: RemoteParticipantStreams) => void;
  removeRemoteParticipantMedia: (uid: string) => void;
  clearAllRemoteMedia: () => void;
}

function roomState(get: () => CallsState, roomId: string): RoomCallsState {
  get().ensureRoom(roomId);
  return get().callsByRoom[roomId];
}

function mediaMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Permission micro/caméra refusée.";
    if (error.name === "NotFoundError") return "Aucun micro ou caméra détecté.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function localVoicePresence(get: () => CallsState, workspaceId: string): WorkspaceVoicePresence {
  const inCall = get().isLocalInCall(workspaceId);
  const openChannelId = get().localOpenChannelByRoom[workspaceId] ?? null;
  const room = get().callsByRoom[workspaceId];
  const localBlock = room ? findLocalBlock(room.blocks) : undefined;
  const inPrivateCall = inCall && !!localBlock?.inCall && !openChannelId;
  return {
    inPrivateCall,
    openChannelId: inCall && openChannelId ? openChannelId : null,
  };
}

function voiceProfile() {
  const displayName = useStore.getState().userDisplayName.trim() || "Membre";
  const photoURL = useStore.getState().photoURL;
  return { displayName, photoURL };
}

function pushVoicePresence(get: () => CallsState, workspaceId: string) {
  const firebaseUid = useAuthStore.getState().firebaseUid;
  if (!firebaseUid || !workspaceId) return;
  void pushWorkspaceVoiceState(
    workspaceId,
    firebaseUid,
    voiceProfile(),
    localVoicePresence(get, workspaceId),
  ).catch(() => {});
}

function participantUidFromBlock(block: { participants: Array<{ id: string; isLocal?: boolean }> }) {
  const remote = block.participants.find((participant) => !participant.isLocal);
  if (remote) return remote.id;
  return useAuthStore.getState().firebaseUid ?? null;
}

function syncStreamState(set: (partial: Partial<CallsState>) => void) {
  set({ localStream: getLocalMediaStream() });
}

function theaterState(get: () => CallsState, workspaceId: string): TheaterState {
  get().ensureRoom(workspaceId);
  return get().theaterByWorkspace[workspaceId];
}

function patchTheater(
  set: (fn: (s: CallsState) => Partial<CallsState>) => void,
  workspaceId: string,
  patch: Partial<TheaterState>,
) {
  set((s) => ({
    theaterByWorkspace: {
      ...s.theaterByWorkspace,
      [workspaceId]: { ...s.theaterByWorkspace[workspaceId], ...patch },
    },
  }));
}

function isInVoiceSession(state: CallsState, workspaceId: string): boolean {
  const mode = state.getCallsViewMode(workspaceId);
  return (
    state.isLocalInCall(workspaceId) ||
    (mode === "theater" && state.isLocalInTheaterCall(workspaceId))
  );
}

function playMutedTransition(wasMuted: boolean, nextMuted: boolean) {
  if (wasMuted === nextMuted) return;
  if (nextMuted) playVoiceMuteSound();
  else playVoiceUnmuteSound();
}

let ensureRoomCallCount = 0;

export const useCallsStore = create<CallsState>((set, get) => ({
  callsByRoom: {},
  localInCallByRoom: {},
  localOpenChannelByRoom: {},
  theaterByWorkspace: {},
  callsViewModeByWorkspace: {},
  muted: false,
  cameraOn: false,
  screenSharing: false,
  recording: false,
  recordingBusy: false,
  pushToTalk: false,
  raiseHand: false,
  deafen: false,
  muteOthers: false,
  mediaError: null,
  localStream: null,
  screenShareStream: null,
  participantMediaById: { ...DEFAULT_PARTICIPANT_MEDIA },
  remoteMediaByUid: {},
  lastSpokeAtByParticipant: { ...DEFAULT_LAST_SPOKE_AT },
  speakingByParticipant: {},

  markParticipantVoiceActivity: (participantId, speaking) => {
    set((s) => {
      const speakingByParticipant = { ...s.speakingByParticipant };
      const lastSpokeAtByParticipant = { ...s.lastSpokeAtByParticipant };

      if (speaking) {
        speakingByParticipant[participantId] = true;
        lastSpokeAtByParticipant[participantId] = Date.now();
      } else {
        speakingByParticipant[participantId] = false;
      }

      return { speakingByParticipant, lastSpokeAtByParticipant };
    });
  },

  setRemoteParticipantMedia: (uid, media) => {
    if (!uid || uid === "local") return;
    set((s) => ({
      remoteMediaByUid: { ...s.remoteMediaByUid, [uid]: media },
    }));
  },

  removeRemoteParticipantMedia: (uid) => {
    if (!uid) return;
    set((s) => {
      if (!s.remoteMediaByUid[uid]) return s;
      const remoteMediaByUid = { ...s.remoteMediaByUid };
      delete remoteMediaByUid[uid];
      return { remoteMediaByUid };
    });
  },

  clearAllRemoteMedia: () => {
    set({ remoteMediaByUid: {} });
  },

  ensureRoom: (workspaceId) => {
    if (!workspaceId) return;
    // #region agent log
    if (ensureRoomCallCount <= 30 || ensureRoomCallCount % 25 === 0) {
      debugLog(
        "useCallsStore.ts:ensureRoom",
        "ensureRoom called",
        { workspaceId, callCount: ensureRoomCallCount },
        "A",
      );
    }
    // #endregion
    const localFirebaseUid = useAuthStore.getState().firebaseUid;
    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [workspaceId]: syncRoomCallsWithMembers(
          workspaceId,
          s.callsByRoom[workspaceId],
          localFirebaseUid,
        ),
      },
      theaterByWorkspace: {
        ...s.theaterByWorkspace,
        [workspaceId]: syncTheaterWithMembers(
          workspaceId,
          s.theaterByWorkspace[workspaceId],
        ),
      },
    }));
  },

  syncPresenceMembers: (workspaceId, members, localFirebaseUid) => {
    set((s) => {
      const current = s.callsByRoom[workspaceId] ?? createRoomCallsState(workspaceId);
      const mergedBlocks = removeDuplicateRemoteSelfBlocks(
        mergePresenceMemberBlocks(
          workspaceId,
          current.blocks,
          members,
          localFirebaseUid,
        ),
        localFirebaseUid,
      );
      const voiceMembers = members.map((member) => ({
        id: member.id,
        name: member.name,
        photoURL: member.photoURL,
        inPrivateCall: member.voice?.inPrivateCall ?? false,
        openChannelId: member.voice?.openChannelId ?? null,
      }));
      const { blocks, openChannels } = applyRemoteVoiceFromPresence(
        workspaceId,
        mergedBlocks,
        current.openChannels,
        voiceMembers,
        localFirebaseUid,
        s.localOpenChannelByRoom[workspaceId] ?? null,
      );
      if (
        memberBlocksSignature(current.blocks) === memberBlocksSignature(blocks) &&
        openChannelsSignature(current.openChannels) === openChannelsSignature(openChannels)
      ) {
        return s;
      }
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [workspaceId]: { ...current, blocks, openChannels },
        },
      };
    });
  },

  syncRemoteJoinRequests: (workspaceId, pending) => {
    set((s) => {
      const current = s.callsByRoom[workspaceId];
      if (!current) return s;
      const settled = current.requests.filter((request) => request.status !== "pending");
      const pendingIds = new Set(pending.map((request) => request.id));
      const keptSettled = settled.filter((request) => !pendingIds.has(request.id));
      const localPending = current.requests.filter(
        (request) => request.status === "pending" && !pendingIds.has(request.id),
      );
      const requests = [...keptSettled, ...pending, ...localPending];
      const signature = (items: JoinRequest[]) =>
        items
          .map((request) => `${request.id}:${request.status}:${request.fromBlockId}:${request.toBlockId}`)
          .sort()
          .join(";");
      if (signature(current.requests) === signature(requests)) return s;
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [workspaceId]: { ...current, requests },
        },
      };
    });
  },

  completeRemoteKnockJoin: async (workspaceId, partnerUid) => {
    const state = roomState(get, workspaceId);
    const localBlock = findLocalBlock(state.blocks);
    if (!localBlock || !partnerUid) return;
    const toBlockId = memberBlockId(workspaceId, partnerUid);
    const blocks = mergeCallBlocks(state.blocks, localBlock.id, toBlockId);
    const requests = state.requests.map((request) =>
      request.status === "pending" &&
      request.fromBlockId === localBlock.id &&
      request.toBlockId === toBlockId
        ? { ...request, status: "accepted" as const }
        : request,
    );
    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [workspaceId]: { ...state, blocks, requests },
      },
      localInCallByRoom: { ...s.localInCallByRoom, [workspaceId]: true },
    }));
    await get().startLocalMedia();
    playVoiceJoinSound();
  },

  clearJoinRequest: (workspaceId, requestId) => {
    set((s) => {
      const current = s.callsByRoom[workspaceId];
      if (!current) return s;
      const requests = current.requests.filter((request) => request.id !== requestId);
      if (requests.length === current.requests.length) return s;
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [workspaceId]: { ...current, requests },
        },
      };
    });
  },

  syncLocalParticipantProfile: (profile) => {
    set((s) => {
      let changed = false;
      const callsByRoom = { ...s.callsByRoom };
      for (const [roomId, state] of Object.entries(s.callsByRoom)) {
        let roomChanged = false;
        const blocks = state.blocks.map((block) => {
          if (!block.participants.some((participant) => participant.isLocal)) return block;
          roomChanged = true;
          return {
            ...block,
            participants: block.participants.map((participant) =>
              participant.isLocal
                ? {
                    ...participant,
                    ...(profile.displayName !== undefined
                      ? { name: profile.displayName }
                      : {}),
                    ...(profile.photoURL !== undefined
                      ? { photoURL: profile.photoURL ?? undefined }
                      : {}),
                  }
                : participant,
            ),
          };
        });
        if (roomChanged) {
          changed = true;
          callsByRoom[roomId] = { ...state, blocks };
        }
      }
      return changed ? { ...s, callsByRoom } : s;
    });
  },

  startOpenChannelDraft: (roomId) => {
    const state = roomState(get, roomId);
    const openChannels = state.openChannels.filter((channel) => !channel.isDraft);
    const channel = createDraftOpenChannel(roomId);
    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [roomId]: {
          ...state,
          openChannels: [...openChannels, channel],
        },
      },
    }));
  },

  confirmOpenChannel: (roomId, channelId, name) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const state = roomState(get, roomId);
    const channel = state.openChannels.find((entry) => entry.id === channelId);
    if (!channel?.isDraft) return;

    set((s) => {
      const current = s.callsByRoom[roomId];
      if (!current) return s;
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [roomId]: {
            ...current,
            openChannels: current.openChannels.map((entry) =>
              entry.id === channelId
                ? syncOpenChannelVacancy({
                    ...entry,
                    name: trimmedName,
                    isDraft: false,
                  })
                : entry,
            ),
          },
        },
      };
    });
  },

  removeOpenChannel: (roomId, channelId) => {
    const state = roomState(get, roomId);
    if (!state.openChannels.some((channel) => channel.id === channelId)) return;

    if (get().localOpenChannelByRoom[roomId] === channelId) {
      get().leaveCall(roomId);
    }

    set((s) => {
      const current = s.callsByRoom[roomId];
      if (!current) return s;
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [roomId]: {
            ...current,
            openChannels: current.openChannels.filter((channel) => channel.id !== channelId),
          },
        },
      };
    });
  },

  purgeIdleOpenChannels: () => {
    const now = Date.now();
    set((s) => {
      let callsByRoom = s.callsByRoom;
      let localOpenChannelByRoom = s.localOpenChannelByRoom;
      let localInCallByRoom = s.localInCallByRoom;
      let changed = false;

      for (const [roomId, state] of Object.entries(s.callsByRoom)) {
        const synced = mapOpenChannelsVacancy(state.openChannels, now);
        const openChannels = synced.filter((channel) => !isOpenChannelIdleExpired(channel, now));
        const roomChanged =
          openChannels.length !== state.openChannels.length ||
          openChannels.some((channel) => {
            const previous = state.openChannels.find((entry) => entry.id === channel.id);
            if (!previous) return true;
            return previous.vacantSinceAt !== channel.vacantSinceAt;
          }) ||
          state.openChannels.some(
            (channel) => !openChannels.some((entry) => entry.id === channel.id),
          );

        if (!roomChanged) continue;

        changed = true;
        callsByRoom = { ...callsByRoom, [roomId]: { ...state, openChannels } };

        const removedChannelIds = new Set(
          state.openChannels
            .filter((channel) => !openChannels.some((entry) => entry.id === channel.id))
            .map((channel) => channel.id),
        );
        const localChannelId = localOpenChannelByRoom[roomId];
        if (localChannelId && removedChannelIds.has(localChannelId)) {
          localOpenChannelByRoom = { ...localOpenChannelByRoom, [roomId]: null };
          localInCallByRoom = { ...localInCallByRoom, [roomId]: false };
        }
      }

      if (!changed) return s;
      return { callsByRoom, localOpenChannelByRoom, localInCallByRoom };
    });
  },

  kickMember: (roomId, blockId) => {
    if (!useWorkspacesStore.getState().isWorkspaceOwner(roomId)) return;
    const state = roomState(get, roomId);
    const target = state.blocks.find((block) => block.id === blockId);
    if (!target || target.participants.some((participant) => participant.isLocal)) return;

    const participantIds = new Set(target.participants.map((participant) => participant.id));

    set((s) => {
      const current = s.callsByRoom[roomId];
      if (!current) return s;

      const blocks = current.blocks.filter((block) => block.id !== blockId);
      const openChannels = mapOpenChannelsVacancy(
        current.openChannels.map((channel) => {
          const participants = channel.participants.filter(
            (participant) => !participantIds.has(participant.id),
          );
          const hasRemote = participants.some((participant) => !participant.isLocal);
          return {
            ...channel,
            participants,
            inCall: hasRemote && participants.length > 0,
          };
        }),
      );
      const requests = current.requests.filter(
        (request) => request.fromBlockId !== blockId && request.toBlockId !== blockId,
      );

      return {
        callsByRoom: {
          ...s.callsByRoom,
          [roomId]: { ...current, blocks, openChannels, requests },
        },
      };
    });
  },

  joinOpenChannel: (roomId, channelId) => {
    const state = roomState(get, roomId);
    const channel = state.openChannels.find((c) => c.id === channelId);
    if (!channel || channel.isDraft) return;

    const localBlock = findLocalBlock(state.blocks);
    const localUser = localBlock?.participants.find((p) => p.isLocal);
    if (!localUser) return;

    set((s) => {
      const current = s.callsByRoom[roomId];
      if (!current) return s;
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [roomId]: {
            ...current,
            blocks: current.blocks.map((b) =>
              b.participants.some((p) => p.isLocal) && b.participants.length === 1
                ? { ...b, inCall: false }
                : b,
            ),
            openChannels: mapOpenChannelsVacancy(
              current.openChannels.map((c) => {
                if (c.id !== channelId) {
                  return {
                    ...c,
                    participants: c.participants.filter((p) => !p.isLocal),
                  };
                }
                const hasLocal = c.participants.some((p) => p.isLocal);
                const participants = hasLocal ? c.participants : [...c.participants, localUser];
                const hasRemote = participants.some((p) => !p.isLocal);
                return {
                  ...c,
                  inCall: hasRemote || participants.some((p) => p.isLocal),
                  participants,
                };
              }),
            ),
          },
        },
        localInCallByRoom: { ...s.localInCallByRoom, [roomId]: true },
        localOpenChannelByRoom: { ...s.localOpenChannelByRoom, [roomId]: channelId },
        mediaError: null,
      };
    });
    pushVoicePresence(get, roomId);
    playVoiceJoinSound();

    void (async () => {
      try {
        if (!hasLocalMediaStream()) {
          await acquireLocalMedia({ audio: true, video: get().cameraOn });
        }
        setMicrophoneEnabled(!get().muted);
        syncStreamState(set);
        set({ mediaError: null });
      } catch (error) {
        set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
      }
    })();
  },

  prefetchVoiceMedia: async () => {
    if (hasLocalMediaStream()) return;
    try {
      await acquireLocalMedia({ audio: true, video: false });
      syncStreamState(set);
    } catch {
      // Permission refusée ou indisponible — join retentera au clic.
    }
  },

  getTheater: (workspaceId) => theaterState(get, workspaceId),

  getRoomCalls: (roomId) => roomState(get, roomId),

  getCallsViewMode: (workspaceId) =>
    get().callsViewModeByWorkspace[workspaceId] ?? "blocks",

  openTheaterView: (workspaceId) => {
    get().ensureRoom(workspaceId);
    set((s) => ({
      callsViewModeByWorkspace: {
        ...s.callsViewModeByWorkspace,
        [workspaceId]: "theater",
      },
    }));
    if (!get().isLocalInTheaterCall(workspaceId)) {
      get().joinTheater(workspaceId);
    }
  },

  closeTheaterView: (workspaceId) => {
    set((s) => ({
      callsViewModeByWorkspace: {
        ...s.callsViewModeByWorkspace,
        [workspaceId]: "blocks",
      },
    }));
  },

  isLocalInCall: (workspaceId) => get().localInCallByRoom[workspaceId] ?? false,

  isLocalInTheaterCall: (workspaceId) => {
    const theater = get().theaterByWorkspace[workspaceId];
    return theater ? isLocalInTheater(theater) : false;
  },

  canSpeakInTheater: (workspaceId) => {
    const theater = get().theaterByWorkspace[workspaceId];
    return theater ? canLocalSpeak(theater) : false;
  },

  joinTheater: (workspaceId, asSpeaker = false) => {
    const theater = theaterState(get, workspaceId);
    if (theater.localRole) return;

    const localParticipant = {
      ...LOCAL_USER,
      role: asSpeaker ? ("speaker" as const) : ("audience" as const),
    };

    if (asSpeaker) {
      patchTheater(set, workspaceId, {
        speakers: [...theater.speakers, localParticipant],
        localRole: "speaker",
      });
    } else {
      patchTheater(set, workspaceId, {
        audience: [...theater.audience, localParticipant],
        localRole: "audience",
      });
    }

    const wasMuted = get().muted;
    const nextMuted = !asSpeaker;
    set({ muted: nextMuted, raiseHand: false });
    playMutedTransition(wasMuted, nextMuted);
    void get().startLocalMedia();
    playVoiceJoinSound();
  },

  leaveTheater: (workspaceId) => {
    const theater = get().theaterByWorkspace[workspaceId];
    if (!theater?.localRole) return;

    if (useStore.getState().chatPanelMode === "theater") {
      useStore.getState().setChatPanelMode("agent");
    }

    const withoutLocal = (users: typeof theater.speakers) =>
      users.filter((u) => !u.isLocal);

    const handRaises = theater.handRaises.filter(
      (r) => r.userId !== LOCAL_USER.id || r.status !== "pending",
    );

    get().stopLocalMediaTracks();
    stopScreenShare();

    patchTheater(set, workspaceId, {
      speakers: withoutLocal(theater.speakers),
      audience: withoutLocal(theater.audience),
      question: theater.question?.isLocal ? null : theater.question,
      handRaises,
      localRole: null,
    });

    set({
      muted: false,
      cameraOn: false,
      screenSharing: false,
      screenShareStream: null,
      recording: false,
      raiseHand: false,
      pushToTalk: false,
      deafen: false,
      muteOthers: false,
    });

    playVoiceLeaveSound();
    get().closeTheaterView(workspaceId);
  },

  toggleBlockRaiseHand: (workspaceId) => {
    if (!get().isLocalInCall(workspaceId)) return;
    if (!get().localOpenChannelByRoom[workspaceId]) return;

    const state = roomState(get, workspaceId);
    const existing = state.handRaises.find(
      (request) => request.userId === LOCAL_USER.id && request.status === "pending",
    );

    if (existing) {
      set((current) => ({
        callsByRoom: {
          ...current.callsByRoom,
          [workspaceId]: {
            ...state,
            handRaises: state.handRaises.map((request) =>
              request.id === existing.id
                ? { ...request, status: "declined" as const }
                : request,
            ),
          },
        },
        raiseHand: false,
      }));
      return;
    }

    const request: HandRaiseRequest = {
      id: `hand-${Date.now()}`,
      workspaceId,
      userId: LOCAL_USER.id,
      userName: LOCAL_USER.name,
      status: "pending",
    };

    set((current) => ({
      callsByRoom: {
        ...current.callsByRoom,
        [workspaceId]: {
          ...state,
          handRaises: [...state.handRaises, request],
        },
      },
      raiseHand: true,
    }));
  },

  toggleTheaterRaiseHand: (workspaceId) => {
    const theater = theaterState(get, workspaceId);
    if (!canLocalRaiseHand(theater)) {
      const pending = theater.handRaises.find(
        (r) => r.userId === LOCAL_USER.id && r.status === "pending",
      );
      if (pending) get().cancelHandRaise(workspaceId, pending.id);
      return;
    }

    const request: HandRaiseRequest = {
      id: `hand-${Date.now()}`,
      workspaceId,
      userId: LOCAL_USER.id,
      userName: LOCAL_USER.name,
      status: "pending",
    };

    patchTheater(set, workspaceId, {
      handRaises: [...theater.handRaises, request],
    });
    set({ raiseHand: true });
  },

  acceptHandRaise: (workspaceId, requestId) => {
    const theater = theaterState(get, workspaceId);
    if (theater.localRole !== "speaker") return;

    const request = theater.handRaises.find(
      (r) => r.id === requestId && r.status === "pending",
    );
    if (!request || theater.question) return;

    const fromAudience = theater.audience.find((u) => u.id === request.userId);
    if (!fromAudience) return;

    const questionParticipant = { ...fromAudience, role: "question" as const };
    const audience = theater.audience.filter((u) => u.id !== request.userId);
    const handRaises = theater.handRaises.map((r) =>
      r.id === requestId ? { ...r, status: "accepted" as const } : r,
    );

    patchTheater(set, workspaceId, {
      audience,
      question: questionParticipant,
      handRaises,
    });

    if (fromAudience.isLocal) {
      const wasMuted = get().muted;
      set({ muted: false, raiseHand: false });
      playMutedTransition(wasMuted, false);
      patchTheater(set, workspaceId, { localRole: "question" });
    }
  },

  declineHandRaise: (workspaceId, requestId) => {
    const theater = theaterState(get, workspaceId);
    const handRaises = theater.handRaises.map((r) =>
      r.id === requestId ? { ...r, status: "declined" as const } : r,
    );
    patchTheater(set, workspaceId, { handRaises });

    const request = theater.handRaises.find((r) => r.id === requestId);
    if (request?.userId === LOCAL_USER.id) set({ raiseHand: false });
  },

  cancelHandRaise: (workspaceId, requestId) => {
    get().declineHandRaise(workspaceId, requestId);
  },

  endQuestion: (workspaceId) => {
    const theater = theaterState(get, workspaceId);
    if (!theater.question) return;

    const returning = { ...theater.question, role: "audience" as const };
    const audience = [...theater.audience, returning];

    patchTheater(set, workspaceId, {
      audience,
      question: null,
    });

    if (returning.isLocal) {
      const wasMuted = get().muted;
      set({ muted: true });
      playMutedTransition(wasMuted, true);
      patchTheater(set, workspaceId, { localRole: "audience" });
    }
  },

  startLocalMedia: async () => {
    try {
      await acquireLocalMedia({ audio: true, video: get().cameraOn });
      setMicrophoneEnabled(!get().muted);
      syncStreamState(set);
      set({ mediaError: null });
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
    }
  },

  stopLocalMediaTracks: () => {
    stopLocalMedia();
    set({ localStream: null, mediaError: null });
  },

  joinCall: async (roomId, options) => {
    get().ensureRoom(roomId);
    if (get().isLocalInCall(roomId) && !get().mediaError) return;

    const markLocalBlockInCall = options?.markLocalBlockInCall !== false;

    try {
      await acquireLocalMedia({ audio: true, video: get().cameraOn });
      setMicrophoneEnabled(!get().muted);
      syncStreamState(set);

      const state = get().callsByRoom[roomId];
      const localBlock = state ? findLocalBlock(state.blocks) : undefined;
      if (state && localBlock && markLocalBlockInCall) {
        set((s) => ({
          callsByRoom: {
            ...s.callsByRoom,
            [roomId]: {
              ...state,
              blocks: state.blocks.map((b) =>
                b.id === localBlock.id ? { ...b, inCall: true } : b,
              ),
            },
          },
          localInCallByRoom: { ...s.localInCallByRoom, [roomId]: true },
          mediaError: null,
        }));
      } else {
        set((s) => ({
          localInCallByRoom: { ...s.localInCallByRoom, [roomId]: true },
          mediaError: null,
        }));
      }
      playVoiceJoinSound();
      pushVoicePresence(get, roomId);
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
    }
  },

  requestJoin: (roomId, toBlockId) => {
    const state = roomState(get, roomId);
    const localBlock = findLocalSoloBlock(state.blocks) ?? findLocalBlock(state.blocks);
    if (!localBlock) return;

    const toBlock = state.blocks.find((block) => block.id === toBlockId);
    const toUid = participantUidFromBlock(toBlock ?? { participants: [] });
    const remoteInPrivateCall =
      !!toUid && useWorkspacePresenceStore.getState().isInPrivateCall(roomId, toUid);

    if (
      !canRequestJoin(state.blocks, state.requests, localBlock.id, toBlockId, {
        remoteInPrivateCall,
      })
    ) {
      return;
    }

    if (!toBlock) return;
    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (!toUid || !firebaseUid) return;

    const requestId = `${firebaseUid}_${toUid}`;
    const request: JoinRequest = {
      id: requestId,
      roomId,
      fromBlockId: localBlock.id,
      toBlockId,
      status: "pending",
    };

    set((s) => {
      const current = s.callsByRoom[roomId] ?? state;
      const withoutDuplicate = current.requests.filter((entry) => entry.id !== requestId);
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [roomId]: {
            ...current,
            requests: [...withoutDuplicate, request],
          },
        },
      };
    });

    void sendVoiceKnock(roomId, firebaseUid, voiceProfile().displayName, toUid).catch(() => {
      get().clearJoinRequest(roomId, requestId);
    });
  },

  acceptJoin: (roomId, requestId) => {
    const state = roomState(get, roomId);
    const request = state.requests.find((r) => r.id === requestId && r.status === "pending");
    if (!request) return;

    const fromBlock = state.blocks.find((block) => block.id === request.fromBlockId);
    const fromUid = participantUidFromBlock(fromBlock ?? { participants: [] });
    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (fromUid && firebaseUid) {
      void respondVoiceKnock(roomId, fromUid, firebaseUid, true).catch(() => {});
    }

    const blocks = mergeCallBlocks(state.blocks, request.fromBlockId, request.toBlockId);
    const requests = state.requests.map((r) =>
      r.id === requestId ? { ...r, status: "accepted" as const } : r,
    );

    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [roomId]: { ...state, blocks, requests },
      },
      localInCallByRoom: { ...s.localInCallByRoom, [roomId]: true },
    }));
    void get().startLocalMedia();
    playVoiceJoinSound();
    pushVoicePresence(get, roomId);
  },

  declineJoin: (roomId, requestId) => {
    const state = roomState(get, roomId);
    const request = state.requests.find((r) => r.id === requestId && r.status === "pending");
    if (request) {
      const fromBlock = state.blocks.find((block) => block.id === request.fromBlockId);
      const fromUid = participantUidFromBlock(fromBlock ?? { participants: [] });
      const firebaseUid = useAuthStore.getState().firebaseUid;
      if (fromUid && firebaseUid) {
        void respondVoiceKnock(roomId, fromUid, firebaseUid, false).catch(() => {});
      }
    }
    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [roomId]: {
          ...state,
          requests: state.requests.map((r) =>
            r.id === requestId ? { ...r, status: "declined" as const } : r,
          ),
        },
      },
    }));
  },

  cancelJoin: (roomId, requestId) => {
    const state = roomState(get, roomId);
    const request = state.requests.find((r) => r.id === requestId && r.status === "pending");
    if (!request) return;
    const localBlock = findLocalBlock(state.blocks);
    if (!localBlock || request.fromBlockId !== localBlock.id) return;

    const toBlock = state.blocks.find((block) => block.id === request.toBlockId);
    const toUid = participantUidFromBlock(toBlock ?? { participants: [] });
    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (toUid && firebaseUid) {
      void cancelVoiceKnock(roomId, firebaseUid, toUid).catch(() => {});
    }
    get().clearJoinRequest(roomId, requestId);
  },

  leaveCall: (workspaceId) => {
    if (useAiNotesStore.getState().active) {
      void useAiNotesStore.getState().stop();
    }
    if (useFollowUpCaptureStore.getState().active) {
      void useFollowUpCaptureStore.getState().stopAndProcess();
    }

    const mode = get().getCallsViewMode(workspaceId);
    if (mode === "theater") {
      if (get().isLocalInTheaterCall(workspaceId)) {
        get().leaveTheater(workspaceId);
      } else {
        get().closeTheaterView(workspaceId);
      }
      return;
    }

    const state = roomState(get, workspaceId);
    const localBlock = findLocalBlock(state.blocks);
    if (!localBlock) return;

    const blocks = (
      localBlock.participants.length > 1
        ? splitLocalFromBlock(state.blocks, localBlock.id)
        : state.blocks
    ).map((b) =>
      b.participants.some((p) => p.isLocal) ? { ...b, inCall: false } : b,
    );

    const wasInCall = get().isLocalInCall(workspaceId);

    get().stopLocalMediaTracks();
    stopScreenShare();

    const openChannels = mapOpenChannelsVacancy(
      (state.openChannels ?? []).map((c) => {
        const participants = c.participants.filter((p) => !p.isLocal);
        return { ...c, participants, inCall: participants.length > 0 };
      }),
    );

    const handRaises = state.handRaises.filter(
      (request) => request.userId !== LOCAL_USER.id || request.status !== "pending",
    );

    set({
      callsByRoom: {
        ...get().callsByRoom,
        [workspaceId]: { ...state, blocks, openChannels, handRaises },
      },
      localInCallByRoom: { ...get().localInCallByRoom, [workspaceId]: false },
      localOpenChannelByRoom: { ...get().localOpenChannelByRoom, [workspaceId]: null },
      muted: false,
      cameraOn: false,
      screenSharing: false,
      screenShareStream: null,
      recording: false,
      pushToTalk: false,
      raiseHand: false,
      deafen: false,
      muteOthers: false,
      lastSpokeAtByParticipant: { ...DEFAULT_LAST_SPOKE_AT },
      speakingByParticipant: {},
      remoteMediaByUid: {},
    });
    if (wasInCall) playVoiceLeaveSound();
    pushVoicePresence(get, workspaceId);
  },

  leaveGroupCall: (roomId) => {
    const state = roomState(get, roomId);
    const localBlock = findLocalBlock(state.blocks);
    if (!localBlock || localBlock.participants.length <= 1) return;

    const blocks = splitLocalFromBlock(state.blocks, localBlock.id);
    set({
      callsByRoom: { ...get().callsByRoom, [roomId]: { ...state, blocks } },
      raiseHand: false,
      pushToTalk: false,
      muteOthers: false,
    });
  },

  toggleMuted: async () => {
    const activeRoomId = useStore.getState().activeRoomId;
    const state = get();
    const wasMuted = state.muted;
    const nextMuted = !wasMuted;
    const inTheater =
      state.getCallsViewMode(activeRoomId) === "theater" &&
      state.isLocalInTheaterCall(activeRoomId);
    const inVoice = isInVoiceSession(state, activeRoomId);

    if (inTheater && !state.canSpeakInTheater(activeRoomId) && !nextMuted) {
      playVoiceMuteSound();
      return;
    }

    if (!inVoice) {
      if (!nextMuted) {
        await get().joinCall(activeRoomId);
      } else {
        set({ muted: nextMuted });
        playMutedTransition(wasMuted, nextMuted);
        return;
      }
    }

    try {
      await acquireLocalMedia({ audio: true, video: state.cameraOn });
      setMicrophoneEnabled(!nextMuted);
      syncStreamState(set);
      set({ muted: nextMuted, mediaError: null });
      playMutedTransition(wasMuted, nextMuted);
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
    }
  },

  toggleCamera: async () => {
    const activeRoomId = useStore.getState().activeRoomId;
    const state = get();
    const inVoice = isInVoiceSession(state, activeRoomId);
    const nextCameraOn = !state.cameraOn;

    if (nextCameraOn && !inVoice) {
      await get().joinCall(activeRoomId);
    }

    try {
      if (nextCameraOn) {
        await acquireLocalMedia({ audio: true, video: false });
        await enableCamera();
        setMicrophoneEnabled(!get().muted);
      } else {
        disableCamera();
      }
      syncStreamState(set);
      set({ cameraOn: nextCameraOn, mediaError: null });
    } catch (error) {
      disableCamera();
      syncStreamState(set);
      set({
        cameraOn: false,
        mediaError: mediaMessage(error, "Impossible d'accéder à la caméra."),
      });
    }
  },

  toggleScreenShare: async () => {
    const activeRoomId = useStore.getState().activeRoomId;
    const state = get();
    const inVoice = isInVoiceSession(state, activeRoomId);

    if (!state.screenSharing && !inVoice) {
      await get().joinCall(activeRoomId);
    }

    if (get().screenSharing) {
      stopScreenShare();
      set({ screenSharing: false, screenShareStream: null, mediaError: null });
      playScreenShareStopSound();
      return;
    }
    try {
      const stream = await startScreenShare();
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          stopScreenShare();
          set({ screenSharing: false, screenShareStream: null });
          playScreenShareStopSound();
        };
      }
      set({
        screenSharing: true,
        screenShareStream: stream,
        mediaError: null,
      });
      playScreenShareStartSound();
    } catch (error) {
      stopScreenShare();
      set({
        screenSharing: false,
        screenShareStream: null,
        mediaError: mediaMessage(error, "Impossible de partager l'écran."),
      });
    }
  },
  toggleRecording: async () => {
    if (get().recordingBusy) return;

    if (get().recording) {
      set({ recordingBusy: true });
      try {
        const {
          stopAppScreenRecording,
          isRecordingTooShort,
          isAppScreenRecording,
          abortAppScreenRecording,
        } = await import("../lib/appScreenRecording");

        if (!isAppScreenRecording()) {
          set({ recording: false, recordingBusy: false, mediaError: null });
          return;
        }

        const { saveRecordingBlob } = await import("../lib/recordingsStorage");
        const { blob, durationMs } = await stopAppScreenRecording();

        if (isRecordingTooShort(durationMs, blob)) {
          await abortAppScreenRecording();
          set({ recording: false, recordingBusy: false, mediaError: null });
          return;
        }

        const recordingId = `rec-${Date.now()}`;
        await saveRecordingBlob(recordingId, blob);
        const { useStore } = await import("./useStore");
        const { useNotificationsStore } = await import("./useNotificationsStore");
        useStore.getState().saveRecordingSession({ recordingId, durationMs });
        useNotificationsStore.getState().push({
          kind: "connector",
          title: "Enregistrement sauvegardé",
          body: "Disponible dans l'historique du chat.",
        });
        set({ recording: false, recordingBusy: false, mediaError: null });
      } catch (error) {
        const { abortAppScreenRecording } = await import("../lib/appScreenRecording");
        await abortAppScreenRecording();
        set({
          recording: false,
          recordingBusy: false,
          mediaError: mediaMessage(error, "Impossible de finaliser l'enregistrement."),
        });
      }
      return;
    }

    set({ recording: true, mediaError: null });
    void (async () => {
      try {
        const { startAppScreenRecording } = await import("../lib/appScreenRecording");
        await startAppScreenRecording();
      } catch {
        const { abortAppScreenRecording } = await import("../lib/appScreenRecording");
        await abortAppScreenRecording();
      }
    })();
  },
  handleRecordingStreamEnded: async () => {
    const { abortAppScreenRecording } = await import("../lib/appScreenRecording");
    await abortAppScreenRecording();
  },
  handleRecordingCaptureLost: async () => {
    const { abortAppScreenRecording } = await import("../lib/appScreenRecording");
    await abortAppScreenRecording();
  },
  togglePushToTalk: () => {
    const wasMuted = get().muted;
    const nextPushToTalk = !get().pushToTalk;
    const nextMuted = nextPushToTalk ? true : wasMuted;
    set({ pushToTalk: nextPushToTalk, muted: nextMuted });
    playMutedTransition(wasMuted, nextMuted);
  },
  toggleDeafen: () => set((s) => ({ deafen: !s.deafen })),
  toggleMuteOthers: () => set((s) => ({ muteOthers: !s.muteOthers })),
}));
