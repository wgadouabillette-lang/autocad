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
  reconcileBlocksAfterPresenceSync,
  removeDuplicateRemoteSelfBlocks,
  splitDepartedRemotesFromMergedBlocks,
  splitLocalFromBlock,
  splitRemoteParticipantFromBlock,
  syncRoomCallsWithMembers,
  syncRemoteHandRaises,
  mutedByParticipantSignature,
  handRaisesSignature,
  type JoinRequest,
  type RoomCallsState,
} from "../lib/calls";
import {
  cancelVoiceKnock,
  respondVoiceKnock,
  sendVoiceEject,
  sendVoiceKnock,
} from "../lib/firebase/workspaceVoiceKnocks";
import {
  touchWorkspacePresence,
  type WorkspaceVoicePresence,
} from "../lib/firebase/workspacePresence";
import {
  removeOpenVoiceChannel,
  upsertOpenVoiceChannel,
  type OpenVoiceChannelDoc,
} from "../lib/firebase/workspaceOpenVoiceChannels";
import { getLocalPresenceActivityForSync } from "../lib/localPresenceActivity";
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
import { isMarketingTheaterPreviewScene } from "../lib/marketingPreview";
import { useAiNotesStore } from "./useAiNotesStore";
import { useFollowUpCaptureStore } from "./useFollowUpCaptureStore";
import { useStore } from "./useStore";
import { useTheaterChatStore } from "./useTheaterChatStore";
import {
  assignAudienceSeat,
  buildTheaterAudienceSeats,
  canLocalRaiseHand,
  canLocalSpeak,
  clearAudienceSeat,
  createTheaterState,
  firstFreeAudienceSeatIndex,
  isLocalInTheater,
  LOCAL_USER,
  syncTheaterWithMembers,
  THEATER_AUDIENCE_SEAT_COUNT,
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
  mutedByParticipant: Record<string, boolean>;

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
  syncRemoteOpenVoiceChannels: (
    workspaceId: string,
    remoteChannels: OpenVoiceChannelDoc[],
  ) => void;
  clearWorkspaceResources: (workspaceId: string) => void;
  completeRemoteKnockJoin: (workspaceId: string, partnerUid: string, requestId?: string) => Promise<void>;
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
  joinOpenChannel: (roomId: string, channelId: string) => Promise<void>;
  prefetchVoiceMedia: () => Promise<void>;
  getCallsViewMode: (workspaceId: string) => CallsViewMode;
  openTheaterView: (workspaceId: string) => void;
  closeTheaterView: (workspaceId: string) => void;
  getTheater: (workspaceId: string) => TheaterState;
  joinTheater: (workspaceId: string, asSpeaker?: boolean) => void;
  promoteOwnerToTheaterSpeaker: (workspaceId: string) => void;
  returnToTheaterBackstage: (workspaceId: string) => void;
  moveLocalTheaterSeat: (workspaceId: string, seatIndex: number) => void;
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
  acceptJoin: (roomId: string, requestId: string) => Promise<void>;
  declineJoin: (roomId: string, requestId: string) => void;
  cancelJoin: (roomId: string, requestId: string) => void;
  joinCall: (roomId: string, options?: { markLocalBlockInCall?: boolean }) => Promise<void>;
  leaveCall: (workspaceId: string) => void;
  disconnectRemoteFromPrivateCall: (roomId: string, remoteUserId: string) => void;
  leaveGroupCall: (roomId: string) => void;
  isLocalInCall: (workspaceId: string) => boolean;
  togglePushToTalk: () => void;
  toggleDeafen: () => void;
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
  pushLocalSpeakingPresence: (workspaceId: string, speaking: boolean) => void;
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
  const inTheater = get().isLocalInTheaterCall(workspaceId);
  const inCall = get().isLocalInCall(workspaceId);
  const openChannelId = get().localOpenChannelByRoom[workspaceId] ?? null;
  const room = get().callsByRoom[workspaceId];
  const localBlock = room ? findLocalBlock(room.blocks) : undefined;
  const inPrivateCall = inCall && !!localBlock?.inCall && !openChannelId && !inTheater;
  const firebaseUid = useAuthStore.getState().firebaseUid;
  const speaking = firebaseUid
    ? !!(get().speakingByParticipant[firebaseUid] || get().speakingByParticipant.local)
    : get().speakingByParticipant.local === true;
  const inVoice = inCall || inTheater;
  return {
    inPrivateCall,
    openChannelId: inCall && openChannelId ? openChannelId : null,
    inTheaterCall: inTheater,
    speaking,
    muted: inVoice ? get().muted : false,
    handRaised: inVoice ? get().raiseHand : false,
  };
}

export function buildLocalVoicePresenceForWorkspace(
  workspaceId: string,
): WorkspaceVoicePresence {
  return localVoicePresence(() => useCallsStore.getState(), workspaceId);
}

function voiceProfile() {
  const displayName = useStore.getState().userDisplayName.trim() || "Membre";
  const photoURL = useStore.getState().photoURL;
  return { displayName, photoURL };
}

function pushVoicePresence(get: () => CallsState, workspaceId: string) {
  const firebaseUid = useAuthStore.getState().firebaseUid;
  if (!firebaseUid || !workspaceId) return;
  const activity = getLocalPresenceActivityForSync(workspaceId);
  void touchWorkspacePresence(
    workspaceId,
    firebaseUid,
    voiceProfile(),
    localVoicePresence(get, workspaceId),
    activity,
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

function nextLocalAudienceSeatAssignment(
  audience: TheaterState["audience"],
  seatByUserId: Record<string, number>,
): Record<string, number> {
  const seats = buildTheaterAudienceSeats(audience, seatByUserId);
  const freeIndex = firstFreeAudienceSeatIndex(seats);
  if (freeIndex === null) return seatByUserId;
  return assignAudienceSeat(seatByUserId, LOCAL_USER.id, freeIndex);
}

function nextAudienceSeatAssignment(
  audience: TheaterState["audience"],
  seatByUserId: Record<string, number>,
  userId: string,
): Record<string, number> {
  const seats = buildTheaterAudienceSeats(
    audience.filter((participant) => participant.id !== userId),
    clearAudienceSeat(seatByUserId, userId),
  );
  const freeIndex = firstFreeAudienceSeatIndex(seats);
  if (freeIndex === null) return clearAudienceSeat(seatByUserId, userId);
  return assignAudienceSeat(seatByUserId, userId, freeIndex);
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
  mediaError: null,
  localStream: null,
  screenShareStream: null,
  participantMediaById: { ...DEFAULT_PARTICIPANT_MEDIA },
  remoteMediaByUid: {},
  lastSpokeAtByParticipant: { ...DEFAULT_LAST_SPOKE_AT },
  speakingByParticipant: {},
  mutedByParticipant: {},

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

  pushLocalSpeakingPresence: (workspaceId, speaking) => {
    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (!firebaseUid || !workspaceId || !get().isLocalInCall(workspaceId)) return;
    const activity = getLocalPresenceActivityForSync(workspaceId);
    void touchWorkspacePresence(
      workspaceId,
      firebaseUid,
      voiceProfile(),
      { ...localVoicePresence(get, workspaceId), speaking },
      activity,
    ).catch(() => {});
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
    const hadRoom = Boolean(get().callsByRoom[workspaceId]);
    set((s) => {
      let room = syncRoomCallsWithMembers(
        workspaceId,
        s.callsByRoom[workspaceId],
        localFirebaseUid,
      );

      const presenceMembers = useWorkspacePresenceStore.getState().membersByWorkspace[workspaceId];
      if (presenceMembers) {
        const voiceMembers = Object.entries(presenceMembers).map(([id, entry]) => ({
          id,
          name: entry.displayName,
          photoURL: entry.photoURL,
          inPrivateCall: entry.voice.inPrivateCall,
          openChannelId: entry.voice.openChannelId,
        }));
        const applied = applyRemoteVoiceFromPresence(
          workspaceId,
          room.blocks,
          room.openChannels,
          voiceMembers,
          localFirebaseUid,
          s.localOpenChannelByRoom[workspaceId] ?? null,
        );
        const previousBlocks = s.callsByRoom[workspaceId]?.blocks ?? room.blocks;
        let blocks = reconcileBlocksAfterPresenceSync(
          previousBlocks,
          applied.blocks,
          voiceMembers,
        );
        blocks = splitDepartedRemotesFromMergedBlocks(blocks, voiceMembers);
        room = { ...room, blocks, openChannels: applied.openChannels };
      }

      return {
        callsByRoom: {
          ...s.callsByRoom,
          [workspaceId]: room,
        },
        theaterByWorkspace: {
          ...s.theaterByWorkspace,
          [workspaceId]: (() => {
            const existing = s.theaterByWorkspace[workspaceId];
            if (
              isMarketingTheaterPreviewScene() &&
              existing &&
              (existing.speakers.length > 0 || existing.audience.length > 0)
            ) {
              return existing;
            }
            return syncTheaterWithMembers(workspaceId, existing);
          })(),
        },
      };
    });
    if (!hadRoom) {
      const room = get().callsByRoom[workspaceId];
      for (const channel of room?.openChannels ?? []) {
        if (channel.isDraft) continue;
        void upsertOpenVoiceChannel(workspaceId, channel.id, channel.name);
      }
    }
  },

  syncPresenceMembers: (workspaceId, members, localFirebaseUid) => {
    const currentBefore = get().callsByRoom[workspaceId];
    const voiceMembers = members.map((member) => ({
      id: member.id,
      name: member.name,
      photoURL: member.photoURL,
      inPrivateCall: member.voice?.inPrivateCall ?? false,
      openChannelId: member.voice?.openChannelId ?? null,
    }));
    const partnerLeftMergedCall =
      !!get().localInCallByRoom[workspaceId] &&
      !get().localOpenChannelByRoom[workspaceId] &&
      (currentBefore?.blocks ?? []).some(
        (block) =>
          block.participants.length > 1 &&
          block.participants.some((participant) => participant.isLocal) &&
          block.participants.some(
            (participant) =>
              !participant.isLocal &&
              voiceMembers.find((member) => member.id === participant.id)?.inPrivateCall === false,
          ),
      );

    const nextMutedByParticipant: Record<string, boolean> = {};
    for (const member of members) {
      if (localFirebaseUid && member.id === localFirebaseUid) continue;
      const inVoice =
        member.voice?.inPrivateCall ||
        member.voice?.openChannelId ||
        member.voice?.inTheaterCall;
      if (inVoice) {
        nextMutedByParticipant[member.id] = member.voice?.muted === true;
      }
    }

    const blockHandRaiseMembers = members.filter(
      (member) =>
        member.voice?.inPrivateCall ||
        member.voice?.openChannelId,
    );
    const theaterHandRaiseMembers = members.filter((member) => member.voice?.inTheaterCall);

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
      const { blocks: presenceBlocks, openChannels } = applyRemoteVoiceFromPresence(
        workspaceId,
        mergedBlocks,
        current.openChannels,
        voiceMembers,
        localFirebaseUid,
        s.localOpenChannelByRoom[workspaceId] ?? null,
      );
      let blocks = reconcileBlocksAfterPresenceSync(
        current.blocks,
        presenceBlocks,
        voiceMembers,
      );
      blocks = splitDepartedRemotesFromMergedBlocks(blocks, voiceMembers);

      const nextRoomHandRaises = syncRemoteHandRaises(
        current.handRaises,
        blockHandRaiseMembers,
        localFirebaseUid ?? null,
        workspaceId,
      );
      const theater = s.theaterByWorkspace[workspaceId];
      const nextTheaterHandRaises = theater
        ? syncRemoteHandRaises(
            theater.handRaises,
            theaterHandRaiseMembers,
            localFirebaseUid ?? null,
            workspaceId,
          )
        : null;

      const blocksUnchanged =
        memberBlocksSignature(current.blocks) === memberBlocksSignature(blocks) &&
        openChannelsSignature(current.openChannels) === openChannelsSignature(openChannels);
      const voiceMetaUnchanged =
        mutedByParticipantSignature(s.mutedByParticipant) ===
          mutedByParticipantSignature(nextMutedByParticipant) &&
        handRaisesSignature(current.handRaises) === handRaisesSignature(nextRoomHandRaises) &&
        (!theater ||
          handRaisesSignature(theater.handRaises) ===
            handRaisesSignature(nextTheaterHandRaises ?? theater.handRaises));

      if (!partnerLeftMergedCall && blocksUnchanged && voiceMetaUnchanged) {
        return s;
      }

      return {
        callsByRoom: {
          ...s.callsByRoom,
          [workspaceId]: { ...current, blocks, openChannels, handRaises: nextRoomHandRaises },
        },
        mutedByParticipant: nextMutedByParticipant,
        ...(nextTheaterHandRaises && theater
          ? {
              theaterByWorkspace: {
                ...s.theaterByWorkspace,
                [workspaceId]: { ...theater, handRaises: nextTheaterHandRaises },
              },
            }
          : {}),
        ...(partnerLeftMergedCall
          ? {
              localInCallByRoom: { ...s.localInCallByRoom, [workspaceId]: false },
              speakingByParticipant: {},
              mutedByParticipant: {},
              remoteMediaByUid: {},
              lastSpokeAtByParticipant: { ...DEFAULT_LAST_SPOKE_AT },
            }
          : {}),
      };
    });

    if (partnerLeftMergedCall) {
      get().stopLocalMediaTracks();
      stopScreenShare();
      playVoiceLeaveSound();
      pushVoicePresence(get, workspaceId);
    }
  },

  syncRemoteOpenVoiceChannels: (workspaceId, remoteChannels) => {
    set((s) => {
      const current = s.callsByRoom[workspaceId];
      if (!current) return s;
      const byId = new Map(current.openChannels.map((channel) => [channel.id, channel]));
      for (const remote of remoteChannels) {
        if (!remote.id) continue;
        const existing = byId.get(remote.id);
        if (existing) {
          byId.set(remote.id, {
            ...existing,
            name: remote.name?.trim() || existing.name,
            isDraft: false,
          });
        } else {
          byId.set(remote.id, {
            id: remote.id,
            roomId: workspaceId,
            name: remote.name?.trim() || "Salon vocal",
            participants: [],
            inCall: false,
          });
        }
      }
      const openChannels = mapOpenChannelsVacancy([...byId.values()]);
      if (openChannelsSignature(current.openChannels) === openChannelsSignature(openChannels)) {
        return s;
      }
      return {
        callsByRoom: {
          ...s.callsByRoom,
          [workspaceId]: { ...current, openChannels },
        },
      };
    });
  },

  clearWorkspaceResources: (workspaceId) => {
    const normalized = workspaceId.trim().toLowerCase();
    if (!normalized) return;

    if (get().isLocalInCall(normalized) || get().isLocalInTheaterCall(normalized)) {
      get().leaveCall(normalized);
    }

    set((state) => {
      const callsByRoom = { ...state.callsByRoom };
      const localInCallByRoom = { ...state.localInCallByRoom };
      const localOpenChannelByRoom = { ...state.localOpenChannelByRoom };
      const theaterByWorkspace = { ...state.theaterByWorkspace };
      const callsViewModeByWorkspace = { ...state.callsViewModeByWorkspace };
      delete callsByRoom[normalized];
      delete localInCallByRoom[normalized];
      delete localOpenChannelByRoom[normalized];
      delete theaterByWorkspace[normalized];
      delete callsViewModeByWorkspace[normalized];
      return {
        callsByRoom,
        localInCallByRoom,
        localOpenChannelByRoom,
        theaterByWorkspace,
        callsViewModeByWorkspace,
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

  completeRemoteKnockJoin: async (workspaceId, partnerUid, requestId) => {
    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (!firebaseUid || !partnerUid) return;

    const knockRequestId = requestId ?? `${firebaseUid}_${partnerUid}`;
    if (!get().callsByRoom[workspaceId]) {
      get().ensureRoom(workspaceId);
    }
    const state = get().callsByRoom[workspaceId];
    if (!state) return;

    const pendingRequest = state.requests.find(
      (request) => request.id === knockRequestId && request.status === "pending",
    );
    const hostBlockId = pendingRequest?.toBlockId ?? memberBlockId(workspaceId, partnerUid);
    const knockerBlockId =
      pendingRequest?.fromBlockId ??
      findLocalSoloBlock(state.blocks)?.id ??
      findLocalBlock(state.blocks)?.id;
    if (!knockerBlockId || !hostBlockId || knockerBlockId === hostBlockId) return;

    const hostBlock = state.blocks.find((block) => block.id === hostBlockId);
    const knockerBlock = state.blocks.find((block) => block.id === knockerBlockId);
    if (!hostBlock || !knockerBlock) return;

    const alreadyInHostBlock =
      hostBlock.participants.some((participant) => participant.isLocal) &&
      hostBlock.participants.length > 1;
    const blocks = alreadyInHostBlock
      ? state.blocks
      : mergeCallBlocks(state.blocks, knockerBlockId, hostBlockId);

    try {
      await get().startLocalMedia();
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
      return;
    }

    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [workspaceId]: {
          ...state,
          blocks,
          requests: state.requests.filter((request) => request.id !== knockRequestId),
        },
      },
      localInCallByRoom: { ...s.localInCallByRoom, [workspaceId]: true },
    }));
    pushVoicePresence(get, workspaceId);
    playVoiceJoinSound();
    pushVoicePresence(get, workspaceId);
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
    void upsertOpenVoiceChannel(roomId, channelId, trimmedName);
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
    void removeOpenVoiceChannel(roomId, channelId);
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

  joinOpenChannel: async (roomId, channelId) => {
    const state = roomState(get, roomId);
    const channel = state.openChannels.find((c) => c.id === channelId);
    if (!channel || channel.isDraft) return;

    const localBlock = findLocalBlock(state.blocks);
    const localUser = localBlock?.participants.find((p) => p.isLocal);
    if (!localUser) return;

    try {
      if (!hasLocalMediaStream()) {
        await acquireLocalMedia({ audio: true, video: get().cameraOn });
      }
      setMicrophoneEnabled(!get().muted);
      syncStreamState(set);
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
      return;
    }

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
  },

  prefetchVoiceMedia: async () => {
    if (hasLocalMediaStream()) return;
    const activeRoomId = useStore.getState().activeRoomId;
    if (activeRoomId && get().isLocalInCall(activeRoomId)) return;
    try {
      await acquireLocalMedia({ audio: true, video: false });
      if (!get().isLocalInCall(activeRoomId)) {
        setMicrophoneEnabled(false);
      }
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
    useStore.getState().openTheaterChatPanel();
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
      const audience = [...theater.audience, localParticipant];
      patchTheater(set, workspaceId, {
        audience,
        audienceSeatByUserId: nextLocalAudienceSeatAssignment(
          audience,
          theater.audienceSeatByUserId,
        ),
        localRole: "audience",
      });
    }

    const wasMuted = get().muted;
    const nextMuted = !asSpeaker;
    set({ muted: nextMuted, raiseHand: false });
    playMutedTransition(wasMuted, nextMuted);
    void get().startLocalMedia();
    playVoiceJoinSound();
    pushVoicePresence(get, workspaceId);
  },

  promoteOwnerToTheaterSpeaker: (workspaceId) => {
    if (!useWorkspacesStore.getState().isWorkspaceOwner(workspaceId)) return;

    const theater = theaterState(get, workspaceId);
    if (theater.localRole !== "audience") return;

    const speakers = [
      ...theater.speakers.filter((participant) => !participant.isLocal),
      { ...LOCAL_USER, role: "speaker" as const },
    ];
    const audience = theater.audience.filter((participant) => !participant.isLocal);
    const handRaises = theater.handRaises.filter((request) => request.userId !== LOCAL_USER.id);

    patchTheater(set, workspaceId, {
      speakers,
      audience,
      audienceSeatByUserId: clearAudienceSeat(theater.audienceSeatByUserId, LOCAL_USER.id),
      handRaises,
      localRole: "speaker",
    });

    const wasMuted = get().muted;
    set({ muted: false, raiseHand: false });
    playMutedTransition(wasMuted, false);
  },

  returnToTheaterBackstage: (workspaceId) => {
    const theater = theaterState(get, workspaceId);
    if (theater.localRole === "question") {
      get().endQuestion(workspaceId);
      return;
    }
    if (theater.localRole !== "speaker") return;

    const speakers = theater.speakers.filter((participant) => !participant.isLocal);
    const audience = [
      ...theater.audience.filter((participant) => !participant.isLocal),
      { ...LOCAL_USER, role: "audience" as const },
    ];

    patchTheater(set, workspaceId, {
      speakers,
      audience,
      audienceSeatByUserId: nextLocalAudienceSeatAssignment(
        audience,
        clearAudienceSeat(theater.audienceSeatByUserId, LOCAL_USER.id),
      ),
      localRole: "audience",
    });

    const wasMuted = get().muted;
    set({ muted: true, raiseHand: false });
    playMutedTransition(wasMuted, true);
  },

  moveLocalTheaterSeat: (workspaceId, seatIndex) => {
    const theater = theaterState(get, workspaceId);
    if (theater.localRole !== "audience") return;
    if (seatIndex < 0 || seatIndex >= THEATER_AUDIENCE_SEAT_COUNT) return;

    const seats = buildTheaterAudienceSeats(
      theater.audience,
      theater.audienceSeatByUserId,
    );
    if (seats[seatIndex] !== null) return;

    patchTheater(set, workspaceId, {
      audienceSeatByUserId: assignAudienceSeat(
        theater.audienceSeatByUserId,
        LOCAL_USER.id,
        seatIndex,
      ),
    });
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

    const remainingSpeakers = withoutLocal(theater.speakers);
    const remainingAudience = withoutLocal(theater.audience);
    const remainingQuestion = theater.question?.isLocal ? null : theater.question;

    get().stopLocalMediaTracks();
    stopScreenShare();

    patchTheater(set, workspaceId, {
      speakers: remainingSpeakers,
      audience: remainingAudience,
      audienceSeatByUserId: clearAudienceSeat(theater.audienceSeatByUserId, LOCAL_USER.id),
      question: remainingQuestion,
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
    });

    // Le chat du théâtre est éphémère : on le purge à chaque départ. En mode mock
    // l'utilisateur local est le seul "vrai" participant suivi, donc son leave =
    // dernier départ. Quand la présence multi-utilisateurs sera branchée, ce clear
    // restera correct côté local : le serveur fera le ménage des messages partagés.
    useTheaterChatStore.getState().clearWorkspace(workspaceId);

    playVoiceLeaveSound();
    get().closeTheaterView(workspaceId);
    pushVoicePresence(get, workspaceId);
  },

  toggleBlockRaiseHand: (workspaceId) => {
    if (!get().isLocalInCall(workspaceId)) return;

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
      pushVoicePresence(get, workspaceId);
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
    pushVoicePresence(get, workspaceId);
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
    useTheaterChatStore.getState().sendHandRaiseNotice(workspaceId);
    pushVoicePresence(get, workspaceId);
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
      audienceSeatByUserId: clearAudienceSeat(theater.audienceSeatByUserId, request.userId),
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
    if (request?.userId === LOCAL_USER.id) {
      set({ raiseHand: false });
      pushVoicePresence(get, workspaceId);
    }
  },

  cancelHandRaise: (workspaceId, requestId) => {
    get().declineHandRaise(workspaceId, requestId);
    useTheaterChatStore.getState().revokeHandRaiseNotice(workspaceId);
  },

  endQuestion: (workspaceId) => {
    const theater = theaterState(get, workspaceId);
    if (!theater.question) return;

    const returning = { ...theater.question, role: "audience" as const };
    const audience = [...theater.audience, returning];

    patchTheater(set, workspaceId, {
      audience,
      audienceSeatByUserId: nextAudienceSeatAssignment(
        audience,
        theater.audienceSeatByUserId,
        returning.id,
      ),
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
    if (get().isLocalInCall(roomId) || get().localOpenChannelByRoom[roomId]) return;

    const localBlock = findLocalSoloBlock(state.blocks) ?? findLocalBlock(state.blocks);
    if (!localBlock) return;

    if (
      !canRequestJoin(state.blocks, state.requests, localBlock.id, toBlockId, {
        localInCall: get().isLocalInCall(roomId),
        localInOpenChannel: !!get().localOpenChannelByRoom[roomId],
      })
    ) {
      return;
    }

    const toBlock = state.blocks.find((block) => block.id === toBlockId);
    const toUid = participantUidFromBlock(toBlock ?? { participants: [] });

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

  acceptJoin: async (roomId, requestId) => {
    const state = roomState(get, roomId);
    const request = state.requests.find((r) => r.id === requestId && r.status === "pending");
    if (!request) return;

    const fromBlock = state.blocks.find((block) => block.id === request.fromBlockId);
    const fromUid = participantUidFromBlock(fromBlock ?? { participants: [] });
    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (fromUid && firebaseUid) {
      void respondVoiceKnock(roomId, fromUid, firebaseUid, true).catch(() => {});
    }

    try {
      await get().startLocalMedia();
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
      return;
    }

    const blocks = mergeCallBlocks(state.blocks, request.fromBlockId, request.toBlockId);
    const requests = state.requests.filter((request) => request.id !== requestId);

    set((s) => ({
      callsByRoom: {
        ...s.callsByRoom,
        [roomId]: { ...state, blocks, requests },
      },
      localInCallByRoom: { ...s.localInCallByRoom, [roomId]: true },
    }));
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
      lastSpokeAtByParticipant: { ...DEFAULT_LAST_SPOKE_AT },
      speakingByParticipant: {},
      remoteMediaByUid: {},
    });
    if (wasInCall) playVoiceLeaveSound();
    pushVoicePresence(get, workspaceId);
  },

  disconnectRemoteFromPrivateCall: (roomId, remoteUserId) => {
    const state = roomState(get, roomId);
    const localBlock = findLocalBlock(state.blocks);
    const hostBlockId = memberBlockId(roomId, "local");
    if (!localBlock || localBlock.id !== hostBlockId || localBlock.participants.length <= 1) {
      return;
    }

    let blocks = splitRemoteParticipantFromBlock(state.blocks, localBlock.id, remoteUserId);
    blocks = blocks.map((block) => {
      if (block.participants.some((participant) => participant.isLocal) && block.participants.length === 1) {
        return { ...block, inCall: true };
      }
      if (block.participants.some((participant) => participant.id === remoteUserId)) {
        return { ...block, inCall: false };
      }
      return block;
    });

    const firebaseUid = useAuthStore.getState().firebaseUid;
    if (firebaseUid) {
      void sendVoiceEject(roomId, firebaseUid, voiceProfile().displayName, remoteUserId).catch(() => {});
    }

    set({
      callsByRoom: {
        ...get().callsByRoom,
        [roomId]: { ...state, blocks },
      },
    });
    pushVoicePresence(get, roomId);
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
      set({ muted: nextMuted });
      playMutedTransition(wasMuted, nextMuted);
      return;
    }

    try {
      await acquireLocalMedia({ audio: true, video: state.cameraOn });
      setMicrophoneEnabled(!nextMuted);
      syncStreamState(set);
      set({ muted: nextMuted, mediaError: null });
      playMutedTransition(wasMuted, nextMuted);
      pushVoicePresence(get, activeRoomId);
    } catch (error) {
      set({ mediaError: mediaMessage(error, "Impossible d'accéder au micro.") });
    }
  },

  toggleCamera: async () => {
    const activeRoomId = useStore.getState().activeRoomId;
    const state = get();
    const inVoice = isInVoiceSession(state, activeRoomId);
    const nextCameraOn = !state.cameraOn;
    const inTheater =
      state.getCallsViewMode(activeRoomId) === "theater" &&
      state.isLocalInTheaterCall(activeRoomId);

    if (nextCameraOn && inTheater && !state.canSpeakInTheater(activeRoomId)) {
      set({ mediaError: "Caméra indisponible pour les listeners en théâtre." });
      return;
    }

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
    const inTheater =
      state.getCallsViewMode(activeRoomId) === "theater" &&
      state.isLocalInTheaterCall(activeRoomId);

    if (!state.screenSharing && inTheater && !state.canSpeakInTheater(activeRoomId)) {
      set({ mediaError: "Partage d'écran indisponible pour les listeners en théâtre." });
      return;
    }

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

    const { isMarketingRecordingPreviewScene } = await import("../lib/marketingPreview");
    if (isMarketingRecordingPreviewScene()) {
      set({
        recording: !get().recording,
        recordingBusy: false,
        mediaError: null,
      });
      return;
    }

    const resetRecordingState = (mediaError: string | null = null) => {
      set({ recording: false, recordingBusy: false, mediaError });
    };

    const cancelActiveRecording = async () => {
      const { abortAppScreenRecording, isAppScreenRecording } = await import(
        "../lib/appScreenRecording"
      );
      const { stopRecordingCamera } = await import("../lib/recordingMedia");
      if (isAppScreenRecording()) {
        await abortAppScreenRecording();
      }
      stopRecordingCamera();
      resetRecordingState(null);
    };

    const finalizeActiveRecording = async (): Promise<boolean> => {
      const {
        stopAppScreenRecording,
        isRecordingTooShort,
        isAppScreenRecording,
        abortAppScreenRecording,
      } = await import("../lib/appScreenRecording");
      const { persistRecordingBlob } = await import("../lib/recordingsStorage");
      const { stopRecordingCamera } = await import("../lib/recordingMedia");

      if (!isAppScreenRecording()) {
        stopRecordingCamera();
        resetRecordingState(null);
        return false;
      }

      try {
        const { blob, durationMs } = await stopAppScreenRecording();
        stopRecordingCamera();

        if (isRecordingTooShort(durationMs, blob)) {
          await abortAppScreenRecording();
          resetRecordingState(null);
          return false;
        }

        const recordingId = `rec-${Date.now()}`;
        await persistRecordingBlob(recordingId, blob);
        const { useStore } = await import("./useStore");
        const { useNotificationsStore } = await import("./useNotificationsStore");
        useStore.getState().saveRecordingSession({ recordingId, durationMs });
        useNotificationsStore.getState().push(
          {
            kind: "recording",
            category: "Recordings",
            title: "Recording saved",
            body: "Available in your notes history.",
            recordingSessionId: recordingId,
          },
          { openPanel: true },
        );
        resetRecordingState(null);
        return true;
      } catch (error) {
        await abortAppScreenRecording();
        stopRecordingCamera();
        resetRecordingState(
          mediaMessage(error, "Could not finish the recording."),
        );
        return false;
      }
    };

    if (get().recording) {
      set({ recordingBusy: true });
      await finalizeActiveRecording();
      return;
    }

    set({ recording: true, mediaError: null });
    try {
      const { startAppScreenRecording } = await import("../lib/appScreenRecording");
      await startAppScreenRecording();
    } catch (error) {
      await cancelActiveRecording();
      set({
        recording: false,
        recordingBusy: false,
        mediaError: mediaMessage(error, "Could not start screen recording."),
      });
    }
  },

  handleRecordingStreamEnded: async () => {
    if (!get().recording || get().recordingBusy) return;
    set({ recordingBusy: true });
    const { stopAppScreenRecording, isRecordingTooShort, abortAppScreenRecording } = await import(
      "../lib/appScreenRecording"
    );
    const { persistRecordingBlob } = await import("../lib/recordingsStorage");
    const { stopRecordingCamera } = await import("../lib/recordingMedia");

    try {
      const { blob, durationMs } = await stopAppScreenRecording();
      stopRecordingCamera();

      if (isRecordingTooShort(durationMs, blob)) {
        await abortAppScreenRecording();
        set({ recording: false, recordingBusy: false, mediaError: null });
        return;
      }

      const recordingId = `rec-${Date.now()}`;
      await persistRecordingBlob(recordingId, blob);
      const { useStore } = await import("./useStore");
      const { useNotificationsStore } = await import("./useNotificationsStore");
      useStore.getState().saveRecordingSession({ recordingId, durationMs });
      useNotificationsStore.getState().push(
        {
          kind: "recording",
          category: "Recordings",
          title: "Recording saved",
          body: "Available in your notes history.",
          recordingSessionId: recordingId,
        },
        { openPanel: true },
      );
      set({ recording: false, recordingBusy: false, mediaError: null });
    } catch {
      const { abortAppScreenRecording: abort } = await import("../lib/appScreenRecording");
      await abort();
      stopRecordingCamera();
      set({ recording: false, recordingBusy: false, mediaError: null });
    }
  },

  handleRecordingCaptureLost: async () => {
    const { abortAppScreenRecording, isAppScreenRecording } = await import(
      "../lib/appScreenRecording"
    );
    const { stopRecordingCamera } = await import("../lib/recordingMedia");
    if (isAppScreenRecording()) {
      await abortAppScreenRecording();
    }
    stopRecordingCamera();
    set({ recording: false, recordingBusy: false, mediaError: null });
  },
  togglePushToTalk: () => {
    const wasMuted = get().muted;
    const nextPushToTalk = !get().pushToTalk;
    const nextMuted = nextPushToTalk ? true : wasMuted;
    set({ pushToTalk: nextPushToTalk, muted: nextMuted });
    playMutedTransition(wasMuted, nextMuted);
  },
  toggleDeafen: () => set((s) => ({ deafen: !s.deafen })),
}));
