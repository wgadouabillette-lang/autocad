import {
  onDisconnect,
  onValue,
  ref,
  remove,
  update,
  type OnDisconnect,
  type Unsubscribe,
} from "firebase/database";
import { rtdb } from "./client";
import { useWorkspacesStore } from "../../store/useWorkspacesStore";

import type { PresenceActivityId } from "../presenceActivity";
import type { SpotifyNowPlayingSnapshot } from "../spotifyNowPlaying";

export interface WorkspaceVoicePresence {
  inPrivateCall: boolean;
  openChannelId: string | null;
  inTheaterCall?: boolean;
  speaking?: boolean;
  muted?: boolean;
  handRaised?: boolean;
}

export interface WorkspacePresenceDoc {
  uid: string;
  displayName: string;
  photoURL?: string | null;
  lastSeen?: number;
  /** false after disconnect — node is kept so offline members stay visible. */
  online?: boolean;
  voiceInPrivateCall?: boolean;
  voiceOpenChannelId?: string | null;
  voiceInTheaterCall?: boolean;
  voiceSpeaking?: boolean;
  voiceMuted?: boolean;
  voiceHandRaised?: boolean;
  presenceActivity?: string | null;
  spotifyNowPlaying?: string | null;
  spotifyNowPlayingImageUrl?: string | null;
}

export interface WorkspacePresenceMember {
  uid: string;
  displayName: string;
  photoURL?: string;
  lastSeenMs: number;
  online: boolean;
  voice: WorkspaceVoicePresence;
  presenceActivity: PresenceActivityId | null;
  spotifyNowPlaying: SpotifyNowPlayingSnapshot | null;
}

const disconnectOps = new Map<string, OnDisconnect>();

const OFFLINE_CLEAR = {
  online: false,
  voiceInPrivateCall: false,
  voiceOpenChannelId: null,
  voiceInTheaterCall: false,
  voiceSpeaking: false,
  voiceMuted: false,
  voiceHandRaised: false,
  presenceActivity: null,
  spotifyNowPlaying: null,
  spotifyNowPlayingImageUrl: null,
} as const;

function activityFromDoc(data: WorkspacePresenceDoc): PresenceActivityId | null {
  const value = data.presenceActivity;
  if (typeof value !== "string" || !value || value === "none") return null;
  return value as PresenceActivityId;
}

function voiceFromDoc(data: WorkspacePresenceDoc): WorkspaceVoicePresence {
  return {
    inPrivateCall: data.voiceInPrivateCall === true,
    openChannelId:
      typeof data.voiceOpenChannelId === "string" && data.voiceOpenChannelId
        ? data.voiceOpenChannelId
        : null,
    inTheaterCall: data.voiceInTheaterCall === true,
    speaking: data.voiceSpeaking === true,
    muted: data.voiceMuted === true,
    handRaised: data.voiceHandRaised === true,
  };
}

function presencePath(workspaceId: string, uid?: string) {
  return uid ? `presence/${workspaceId}/${uid}` : `presence/${workspaceId}`;
}

function presenceKey(workspaceId: string, uid: string) {
  return `${workspaceId}/${uid}`;
}

function lastSeenToMs(lastSeen: WorkspacePresenceDoc["lastSeen"]): number {
  return typeof lastSeen === "number" && Number.isFinite(lastSeen) ? lastSeen : 0;
}

function memberFromEntry(uid: string, raw: unknown): WorkspacePresenceMember {
  const data = (raw ?? {}) as WorkspacePresenceDoc;
  return {
    uid: data.uid ?? uid,
    displayName: data.displayName?.trim() || "Membre",
    photoURL: typeof data.photoURL === "string" ? data.photoURL : undefined,
    lastSeenMs: lastSeenToMs(data.lastSeen),
    online: data.online !== false,
    voice: voiceFromDoc(data),
    presenceActivity: activityFromDoc(data),
    spotifyNowPlaying:
      typeof data.spotifyNowPlaying === "string" && data.spotifyNowPlaying.trim()
        ? {
            label: data.spotifyNowPlaying.trim(),
            imageUrl:
              typeof data.spotifyNowPlayingImageUrl === "string" &&
              data.spotifyNowPlayingImageUrl.trim()
                ? data.spotifyNowPlayingImageUrl.trim()
                : null,
          }
        : null,
  };
}

async function armPresenceDisconnect(workspaceId: string, uid: string): Promise<void> {
  const key = presenceKey(workspaceId, uid);
  const node = ref(rtdb, presencePath(workspaceId, uid));
  const previous = disconnectOps.get(key);
  if (previous) {
    try {
      await previous.cancel();
    } catch {
      // Already fired or cancelled.
    }
  }
  const op = onDisconnect(node);
  disconnectOps.set(key, op);
  try {
    // Keep the member row; mark offline + clear ephemeral voice/activity.
    await op.update({ ...OFFLINE_CLEAR });
  } catch {
    disconnectOps.delete(key);
  }
}

export function watchWorkspacePresence(
  workspaceId: string,
  onChange: (members: WorkspacePresenceMember[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!workspaceId) {
    onChange([]);
    return () => {};
  }

  return onValue(
    ref(rtdb, presencePath(workspaceId)),
    (snap) => {
      const value = snap.val() as Record<string, WorkspacePresenceDoc> | null;
      if (!value) {
        onChange([]);
        return;
      }
      const members = Object.entries(value).map(([uid, data]) => memberFromEntry(uid, data));
      onChange(members);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function touchWorkspacePresence(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  voice?: WorkspaceVoicePresence,
  presenceActivity?: PresenceActivityId | null,
  spotifyNowPlaying?: SpotifyNowPlayingSnapshot | null,
): Promise<void> {
  if (!workspaceId || !uid) return;

  const payload: Record<string, unknown> = {
    uid,
    displayName: profile.displayName.trim() || "Membre",
    photoURL: profile.photoURL ? profile.photoURL : null,
    lastSeen: Date.now(),
    online: true,
  };
  if (voice) {
    payload.voiceInPrivateCall = voice.inPrivateCall;
    payload.voiceOpenChannelId = voice.openChannelId ?? null;
    payload.voiceInTheaterCall = voice.inTheaterCall === true;
    payload.voiceSpeaking = voice.speaking === true;
    payload.voiceMuted = voice.muted === true;
    payload.voiceHandRaised = voice.handRaised === true;
  }
  if (presenceActivity !== undefined) {
    payload.presenceActivity =
      presenceActivity && presenceActivity !== "none" ? presenceActivity : null;
  }
  if (spotifyNowPlaying !== undefined) {
    const label = spotifyNowPlaying?.label?.trim();
    if (label && spotifyNowPlaying) {
      payload.spotifyNowPlaying = label.slice(0, 200);
      const imageUrl = spotifyNowPlaying.imageUrl?.trim();
      payload.spotifyNowPlayingImageUrl = imageUrl ? imageUrl.slice(0, 512) : null;
    } else {
      payload.spotifyNowPlaying = null;
      payload.spotifyNowPlayingImageUrl = null;
    }
  }

  const node = ref(rtdb, presencePath(workspaceId, uid));
  await update(node, payload);
  await armPresenceDisconnect(workspaceId, uid);
}

export async function clearWorkspacePresence(workspaceId: string, uid: string): Promise<void> {
  if (!workspaceId || !uid) return;
  const key = presenceKey(workspaceId, uid);
  const previous = disconnectOps.get(key);
  if (previous) {
    try {
      await previous.cancel();
    } catch {
      // ignore
    }
    disconnectOps.delete(key);
  }
  try {
    await remove(ref(rtdb, presencePath(workspaceId, uid)));
  } catch {
    // Already gone.
  }
}

export async function pushWorkspacePresenceActivity(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  presenceActivity: PresenceActivityId | null,
): Promise<void> {
  await touchWorkspacePresence(workspaceId, uid, profile, undefined, presenceActivity);
}

export async function pushWorkspaceVoiceState(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  voice: WorkspaceVoicePresence,
): Promise<void> {
  await touchWorkspacePresence(workspaceId, uid, profile, voice);
}

export async function pushProfileToJoinedWorkspaces(
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
): Promise<void> {
  const workspaces = useWorkspacesStore.getState().joinedWorkspaces(uid);
  await Promise.all(
    workspaces.map((workspace) => touchWorkspacePresence(workspace.id, uid, profile)),
  );
}
