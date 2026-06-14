import {
  avatarColor,
  inCallParticipants,
  userInitials,
  type CallUser,
  type RoomCallsState,
} from "./calls";
import type { TheaterState } from "./theater";

export type CallMediaKind = "camera" | "screen";

export interface ParticipantMediaState {
  cameraOn: boolean;
  screenSharing: boolean;
}

export interface CallMediaFeed {
  feedId: string;
  participantId: string;
  participantName: string;
  kind: CallMediaKind;
  isLocal: boolean;
  stream: MediaStream | null;
  hasVideo: boolean;
  avatarColor: string;
  initials: string;
}

export const MAX_PIP_FEEDS = 3;

export const DEFAULT_PARTICIPANT_MEDIA: Record<string, ParticipantMediaState> = {};

export const DEFAULT_LAST_SPOKE_AT: Record<string, number> = {};

export function activeCallParticipants(
  viewMode: "blocks" | "theater",
  roomCalls: RoomCallsState | undefined,
  theater: TheaterState | undefined,
  localInCall: boolean,
  localOpenChannelId: string | null,
  localInTheater: boolean,
): CallUser[] {
  if (viewMode === "theater" && localInTheater && theater) {
    const users: CallUser[] = [];
    const seen = new Set<string>();
    const push = (user: CallUser) => {
      if (seen.has(user.id)) return;
      seen.add(user.id);
      users.push(user);
    };

    theater.speakers.forEach(push);
    if (theater.question) push(theater.question);
    theater.audience.forEach(push);
    if (theater.localRole) push({ id: "local", name: "Vous", isLocal: true });
    return users;
  }

  if (!roomCalls || !localInCall) return [];
  return inCallParticipants(
    roomCalls.blocks,
    roomCalls.openChannels,
    localInCall,
    localOpenChannelId,
  );
}

function hasLiveVideoTrack(stream: MediaStream | null): boolean {
  return stream?.getVideoTracks().some((track) => track.enabled && track.readyState === "live") ?? false;
}

export function buildCallMediaFeeds(input: {
  cameraOn: boolean;
  screenSharing: boolean;
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  remoteFeeds?: CallMediaFeed[];
}): CallMediaFeed[] {
  const feeds: CallMediaFeed[] = [];

  if (input.screenSharing && hasLiveVideoTrack(input.screenShareStream)) {
    feeds.push({
      feedId: "local:screen",
      participantId: "local",
      participantName: "Vous",
      kind: "screen",
      isLocal: true,
      stream: input.screenShareStream,
      hasVideo: true,
      avatarColor: avatarColor("local"),
      initials: userInitials("Vous"),
    });
  }

  if (input.cameraOn && hasLiveVideoTrack(input.localStream)) {
    feeds.push({
      feedId: "local:camera",
      participantId: "local",
      participantName: "Vous",
      kind: "camera",
      isLocal: true,
      stream: input.localStream,
      hasVideo: true,
      avatarColor: avatarColor("local"),
      initials: userInitials("Vous"),
    });
  }

  if (input.remoteFeeds?.length) {
    for (const feed of input.remoteFeeds) {
      if (feed.hasVideo) feeds.push(feed);
    }
  }

  return feeds;
}

export function selectPipFeeds(
  feeds: CallMediaFeed[],
  lastSpokeAtByParticipant: Record<string, number>,
): CallMediaFeed[] {
  if (feeds.length <= MAX_PIP_FEEDS) return feeds;

  return [...feeds]
    .sort((a, b) => {
      const aTime = lastSpokeAtByParticipant[a.participantId] ?? 0;
      const bTime = lastSpokeAtByParticipant[b.participantId] ?? 0;
      if (bTime !== aTime) return bTime - aTime;
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      if (a.kind !== b.kind) return a.kind === "screen" ? -1 : 1;
      return a.feedId.localeCompare(b.feedId);
    })
    .slice(0, MAX_PIP_FEEDS);
}
