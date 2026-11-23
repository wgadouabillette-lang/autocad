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
import { ensureWorkspaceRtdbAcl, clearWorkspaceRtdbAclCache } from "./workspaceRtdbAcl";

import type { PresenceActivityId } from "../presenceActivity";
import type { SpotifyNowPlayingSnapshot } from "../spotifyNowPlaying";

export interface WorkspaceVoicePresence {
  inPrivateCall: boolean;
  openChannelId: string | null;
  inTheaterCall?: boolean;
  /** speaker, audience ou question — visible par les autres dans le théâtre. */
  theaterRole?: "speaker" | "audience" | "question" | null;
  /** Siège d'audience choisi, pour que les autres voient la photo au bon endroit. */
  theaterSeat?: number | null;
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
  voiceTheaterRole?: string | null;
  voiceTheaterSeat?: number | null;
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
let connectedWatchStarted = false;

const OFFLINE_CLEAR = {
  online: false,
  voiceInPrivateCall: false,
  voiceOpenChannelId: null,
  voiceInTheaterCall: false,
  voiceTheaterRole: null,
  voiceTheaterSeat: null,
  voiceSpeaking: false,
  voiceMuted: false,
  voiceHandRaised: false,
  presenceActivity: null,
  spotifyNowPlaying: null,
  spotifyNowPlayingImageUrl: null,
} as const;

/**
 * Après une coupure réseau, les onDisconnect serveur ont déjà tourné —
 * on oublie le bookkeeping local pour réarmer au prochain touch.
 */
function ensureConnectedWatch(): void {
  if (connectedWatchStarted) return;
  connectedWatchStarted = true;
  onValue(ref(rtdb, ".info/connected"), (snap) => {
    if (snap.val() === true) return;
    disconnectOps.clear();
  });
}

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
    theaterRole:
      data.voiceTheaterRole === "speaker" ||
      data.voiceTheaterRole === "audience" ||
      data.voiceTheaterRole === "question"
        ? data.voiceTheaterRole
        : null,
    theaterSeat:
      typeof data.voiceTheaterSeat === "number" &&
      Number.isInteger(data.voiceTheaterSeat) &&
      data.voiceTheaterSeat >= 0
        ? data.voiceTheaterSeat
        : null,
    speaking: data.voiceSpeaking === true,
    muted: data.voiceMuted === true,
    handRaised: data.voiceHandRaised === true,
  };
}

function presencePath(workspaceId: string, uid?: string) {
  // Must match Cloud Function ACL keys (always lowercased).
  const wid = workspaceId.trim().toLowerCase();
  return uid ? `presence/${wid}/${uid}` : `presence/${wid}`;
}

function presenceKey(workspaceId: string, uid: string) {
  return `${workspaceId.trim().toLowerCase()}/${uid}`;
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

/** Arme onDisconnect une seule fois par session de connexion. */
async function ensurePresenceDisconnect(workspaceId: string, uid: string): Promise<void> {
  ensureConnectedWatch();
  const key = presenceKey(workspaceId, uid);
  if (disconnectOps.has(key)) return;

  const node = ref(rtdb, presencePath(workspaceId, uid));
  const op = onDisconnect(node);
  disconnectOps.set(key, op);
  try {
    // Keep the member row; mark offline + clear ephemeral voice/activity.
    await op.update({ ...OFFLINE_CLEAR });
  } catch {
    disconnectOps.delete(key);
  }
}

/** Last profile signature written per presence node — skip unchanged displayName/photoURL. */
const lastPresenceProfileByKey = new Map<string, string>();

function clearPresenceProfileCache(workspaceId: string, uid: string): void {
  lastPresenceProfileByKey.delete(presenceKey(workspaceId, uid));
}

/** Firebase a repris la socket. `.info/connected` est local, non facturé. */
export function watchRtdbConnection(onConnected: () => void): Unsubscribe {
  ensureConnectedWatch();
  return onValue(ref(rtdb, ".info/connected"), (snap) => {
    if (snap.val() === true) onConnected();
  });
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

  let unsub: Unsubscribe | null = null;
  let cancelled = false;

  void ensureWorkspaceRtdbAcl(workspaceId)
    .then(() => {
      if (cancelled) return;
      unsub = onValue(
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
    })
    .catch(async (error) => {
      // ACL callable may be briefly unavailable right after join — retry once.
      try {
        clearWorkspaceRtdbAclCache(workspaceId);
        await ensureWorkspaceRtdbAcl(workspaceId);
        if (cancelled) return;
        unsub = onValue(
          ref(rtdb, presencePath(workspaceId)),
          (snap) => {
            const value = snap.val() as Record<string, WorkspacePresenceDoc> | null;
            if (!value) {
              onChange([]);
              return;
            }
            const members = Object.entries(value).map(([uid, data]) =>
              memberFromEntry(uid, data),
            );
            onChange(members);
          },
          (watchError) => {
            onError?.(watchError);
          },
        );
      } catch {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });

  return () => {
    cancelled = true;
    unsub?.();
  };
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

  await ensureWorkspaceRtdbAcl(workspaceId);

  const displayName = profile.displayName.trim() || "Membre";
  const photoURL = profile.photoURL ? profile.photoURL : null;
  const profileKey = presenceKey(workspaceId, uid);
  const profileSig = `${displayName}\0${photoURL ?? ""}`;
  const profileChanged = lastPresenceProfileByKey.get(profileKey) !== profileSig;

  // lastSeen date cette écriture. Le profil part seulement au premier envoi ou s'il change.
  const payload: Record<string, unknown> = {
    lastSeen: Date.now(),
    online: true,
  };
  if (profileChanged) {
    payload.uid = uid;
    payload.displayName = displayName;
    payload.photoURL = photoURL;
  }
  if (voice) {
    payload.voiceInPrivateCall = voice.inPrivateCall;
    payload.voiceOpenChannelId = voice.openChannelId ?? null;
    payload.voiceInTheaterCall = voice.inTheaterCall === true;
    payload.voiceTheaterRole = voice.theaterRole ?? null;
    payload.voiceTheaterSeat =
      typeof voice.theaterSeat === "number" && Number.isInteger(voice.theaterSeat)
        ? voice.theaterSeat
        : null;
    // Speaking is UI-only (WebRTC VAD) — clear any legacy RTDB value.
    payload.voiceSpeaking = false;
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
  if (profileChanged) lastPresenceProfileByKey.set(profileKey, profileSig);
  await ensurePresenceDisconnect(workspaceId, uid);
}

export async function clearWorkspacePresence(workspaceId: string, uid: string): Promise<void> {
  if (!workspaceId || !uid) return;
  clearPresenceProfileCache(workspaceId, uid);
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

/** Marque offline sans supprimer le nœud (ex. on quitte le workspace actif). */
export async function markWorkspacePresenceAway(workspaceId: string, uid: string): Promise<void> {
  if (!workspaceId || !uid) return;
  clearPresenceProfileCache(workspaceId, uid);
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
    await update(ref(rtdb, presencePath(workspaceId, uid)), { ...OFFLINE_CLEAR });
  } catch {
    // Node may already be gone.
  }
}

async function currentVoicePresence(workspaceId: string): Promise<WorkspaceVoicePresence> {
  const { buildLocalVoicePresenceForWorkspace } = await import("../../store/useCallsStore");
  return buildLocalVoicePresenceForWorkspace(workspaceId);
}

export async function pushWorkspacePresenceActivity(
  workspaceId: string,
  uid: string,
  profile: { displayName: string; photoURL?: string | null },
  presenceActivity: PresenceActivityId | null,
): Promise<void> {
  const voice = await currentVoicePresence(workspaceId);
  await touchWorkspacePresence(workspaceId, uid, profile, voice, presenceActivity);
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
    workspaces.map(async (workspace) => {
      const voice = await currentVoicePresence(workspace.id);
      await touchWorkspacePresence(workspace.id, uid, profile, voice);
    }),
  );
}
