import { fetchSpotifyPlayerConfig, fetchSpotifyPlayerToken } from "./connectorsApi";
import { hasFormaDesktop, hasSpotifyWebView2Desktop } from "./formaDesktop";

// #region agent log
function dbgDj(hypothesisId: string, location: string, message: string, data: Record<string, unknown> = {}) {
  if (import.meta.env.VITE_FORMA_AGENT_DEBUG !== "1") return;
  fetch("http://127.0.0.1:7941/ingest/bf77dbb7-04a4-446f-817c-db0d19c43744", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9c6d7b" },
    body: JSON.stringify({
      sessionId: "9c6d7b",
      runId: "dj-auto-next",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion

type DesktopPlaybackModule = typeof import("./spotifyWebPlaybackDesktop");
let desktopPlaybackPromise: Promise<DesktopPlaybackModule> | null = null;

function loadDesktopPlayback() {
  if (!hasSpotifyWebView2Desktop()) return null;
  if (!desktopPlaybackPromise) {
    desktopPlaybackPromise = import("./spotifyWebPlaybackDesktop");
  }
  return desktopPlaybackPromise;
}

type SpotifyWebPlayer = {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  activateElement(): Promise<void>;
  getCurrentState(): Promise<{
    position: number;
    paused: boolean;
    duration?: number;
    track_window?: {
      current_track?: { uri?: string } | null;
    };
  } | null>;
  addListener(event: "ready", callback: (data: { device_id: string }) => void): void;
  addListener(event: "not_ready", callback: (data: { device_id: string }) => void): void;
  addListener(
    event: "player_state_changed",
    callback: (state: SpotifyPlayerSnapshot) => void,
  ): void;
  addListener(event: "authentication_error", callback: (data: { message: string }) => void): void;
  addListener(event: "account_error", callback: (data: { message: string }) => void): void;
  addListener(event: "initialization_error", callback: (data: { message: string }) => void): void;
  addListener(
    event: "playback_error",
    callback: (data: { message: string }) => void,
  ): void;
  removeListener(event: string): void;
};

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyWebPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";

let cachedPlayerAccessToken: string | null = null;
let cachedPlayerAccessTokenAt = 0;
const PLAYER_ACCESS_TOKEN_TTL_MS = 50 * 60 * 1000;

async function resolveSpotifyPlayerAccessToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    cachedPlayerAccessToken &&
    Date.now() - cachedPlayerAccessTokenAt < PLAYER_ACCESS_TOKEN_TTL_MS
  ) {
    return cachedPlayerAccessToken;
  }
  const token = await fetchSpotifyPlayerToken();
  cachedPlayerAccessToken = token;
  cachedPlayerAccessTokenAt = Date.now();
  return token;
}

let sdkPromise: Promise<void> | null = null;
let player: SpotifyWebPlayer | null = null;
let deviceId: string | null = null;
let premiumAvailable = false;
let initPromise: Promise<SpotifyWebPlayer | null> | null = null;
let deviceReadyPromise: Promise<string> | null = null;

type PlayerStateListener = (playing: boolean) => void;
type PlaybackEndedListener = () => void;
let onPlayingChange: PlayerStateListener | null = null;
let onPlaybackEnded: PlaybackEndedListener | null = null;
let cachedPositionMs = 0;
let cachedPositionAt = 0;
let cachedDurationMs = 0;
let cachedPlaying = false;
let playbackEndedTimer: ReturnType<typeof setTimeout> | null = null;
let playbackEndConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let playbackProgressTimer: ReturnType<typeof setInterval> | null = null;
let lastPolledPositionMs = -1;
let stalledPollCount = 0;
let playbackStartedAt = 0;
let lastPlayTrackId: string | null = null;
let fullPlaybackDisabled = false;
/** True once position enters the last ~5s — used when Spotify resets to position 0 on end. */
let approachedTrackEnd = false;
const PLAYBACK_END_GRACE_MS = 8_000;

type PlaybackErrorListener = (message: string) => void;
let onPlaybackError: PlaybackErrorListener | null = null;

function withinPlaybackGrace(): boolean {
  return playbackStartedAt > 0 && performance.now() - playbackStartedAt < PLAYBACK_END_GRACE_MS;
}

export function isSpotifyPlaybackStarting(): boolean {
  return withinPlaybackGrace();
}

export function isSpotifyFullPlaybackDisabled(): boolean {
  return fullPlaybackDisabled;
}

export function setSpotifyWebPlaybackErrorListener(listener: PlaybackErrorListener | null) {
  onPlaybackError = listener;
}

function markPlaybackStarted(trackId?: string) {
  playbackStartedAt = performance.now();
  approachedTrackEnd = false;
  cachedDurationMs = 0;
  lastPolledPositionMs = -1;
  stalledPollCount = 0;
  if (trackId) lastPlayTrackId = trackId;
  cancelSpotifyPlaybackEnded();
}

export function markSpotifyPlaybackStarted(): void {
  markPlaybackStarted();
}

async function putPlayOnDevice(trackId: string, activeDeviceId: string): Promise<boolean> {
  const token = await resolveSpotifyPlayerAccessToken();
  const playController = new AbortController();
  const playTimeout = window.setTimeout(() => playController.abort(), 8_000);
  try {
    const play = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(activeDeviceId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
        signal: playController.signal,
      },
    );
    return play.ok || play.status === 204;
  } finally {
    window.clearTimeout(playTimeout);
  }
}

function handlePlaybackError(message: string) {
  if (fullPlaybackDisabled) return;
  fullPlaybackDisabled = true;
  cachedPlaying = false;
  stopPlaybackProgressWatch();
  cancelSpotifyPlaybackEnded();
  void player?.pause().catch(() => undefined);
  onPlayingChange?.(false);
  onPlaybackError?.(message || "Playback error");
}

export function cancelSpotifyPlaybackEnded() {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    void desktop.then((m) => m.cancelSpotifyPlaybackEnded());
    return;
  }
  if (playbackEndedTimer) {
    clearTimeout(playbackEndedTimer);
    playbackEndedTimer = null;
  }
  if (playbackEndConfirmTimer) {
    clearTimeout(playbackEndConfirmTimer);
    playbackEndConfirmTimer = null;
  }
}

function stopPlaybackProgressWatch() {
  if (playbackProgressTimer) {
    clearInterval(playbackProgressTimer);
    playbackProgressTimer = null;
  }
}

function startPlaybackProgressWatch() {
  stopPlaybackProgressWatch();
  if (!player) return;

  playbackProgressTimer = setInterval(() => {
    void player
      ?.getCurrentState()
      .then((state) => {
        if (!state) {
          if (cachedPlaying && !withinPlaybackGrace()) schedulePlaybackEnded();
          return;
        }
        if (typeof state.duration === "number" && state.duration > 0) {
          cachedDurationMs = state.duration;
        }
        if (cachedPlaying && !state.paused) {
          if (state.position === lastPolledPositionMs) {
            stalledPollCount += 1;
            // Audio often freezes near the end without a pause event — treat as ended.
            if (
              stalledPollCount >= 3 &&
              (approachedTrackEnd || isTrackFinished(state) || nearCachedDuration(state.position))
            ) {
              stalledPollCount = 0;
              dbgDj("B", "spotifyWebPlayback.ts:progressWatch", "stalled near end → end", {
                position: state.position,
                duration: state.duration ?? cachedDurationMs,
                approachedTrackEnd,
              });
              schedulePlaybackEnded();
              return;
            }
          } else {
            stalledPollCount = 0;
            lastPolledPositionMs = state.position;
          }
        }
        if (isTrackFinished(state) || nearCachedDuration(state.position)) {
          syncPlaybackPosition(state);
          schedulePlaybackEnded();
        }
      })
      .catch(() => undefined);
  }, 800);
}

function nearCachedDuration(positionMs: number): boolean {
  if (cachedDurationMs <= 0) return false;
  return positionMs >= Math.max(0, cachedDurationMs - 1_500);
}

function schedulePlaybackEnded() {
  if (withinPlaybackGrace()) return;
  // #region agent log
  dbgDj("A", "spotifyWebPlayback.ts:schedulePlaybackEnded", "firing onPlaybackEnded", {
    cachedPlaying,
    cachedPositionMs,
    approachedTrackEnd,
    withinGrace: withinPlaybackGrace(),
  });
  // #endregion
  // Don't call cancelSpotifyPlaybackEnded() here — it cleared the timer we are about to set
  // when progress-watch raced with end detection.
  if (playbackEndedTimer) return;
  if (playbackEndConfirmTimer) {
    clearTimeout(playbackEndConfirmTimer);
    playbackEndConfirmTimer = null;
  }
  playbackEndedTimer = setTimeout(() => {
    playbackEndedTimer = null;
    approachedTrackEnd = false;
    // #region agent log
    dbgDj("C", "spotifyWebPlayback.ts:schedulePlaybackEnded", "timer fired → onPlaybackEnded", {
      hasListener: typeof onPlaybackEnded === "function",
    });
    // #endregion
    onPlaybackEnded?.();
  }, 350);
}

async function confirmPlaybackEndedAfterPause() {
  if (withinPlaybackGrace()) return;
  try {
    const state = await player?.getCurrentState();
    if (!state) {
      schedulePlaybackEnded();
      return;
    }
    if (shouldTreatAsTrackEnded(state)) {
      schedulePlaybackEnded();
    }
  } catch {
    if (!withinPlaybackGrace()) schedulePlaybackEnded();
  }
}

function scheduleEndConfirm() {
  if (withinPlaybackGrace()) return;
  if (playbackEndConfirmTimer) return;
  playbackEndConfirmTimer = setTimeout(() => {
    playbackEndConfirmTimer = null;
    void confirmPlaybackEndedAfterPause();
  }, 600);
}

type SpotifyPlayerSnapshot = {
  paused: boolean;
  position: number;
  duration?: number;
  track_window?: {
    current_track?: { uri?: string } | null;
  };
} | null;

function isTrackFinished(state: SpotifyPlayerSnapshot): boolean {
  if (!state) return false;
  const duration = typeof state.duration === "number" ? state.duration : 0;
  if (duration <= 0) return false;
  return state.position >= Math.max(0, duration - 2_000);
}

/** Natural end: near-end, or Spotify reset to 0 after we had approached the end. */
function shouldTreatAsTrackEnded(state: NonNullable<SpotifyPlayerSnapshot>): boolean {
  if (isTrackFinished(state) || nearCachedDuration(state.position)) return true;
  if (!state.track_window?.current_track) return true;
  // Spotify often jumps to position 0 + paused when the track ends.
  if (state.paused && state.position < 2_000 && (approachedTrackEnd || !withinPlaybackGrace())) {
    // Only treat mid-track pause-at-0 as end if we already neared the end,
    // or if wall-clock playback has exceeded most of the known duration.
    if (approachedTrackEnd) return true;
    if (cachedDurationMs > 0 && playbackStartedAt > 0) {
      const wallMs = performance.now() - playbackStartedAt;
      if (wallMs >= cachedDurationMs - 3_000) return true;
    }
  }
  return false;
}

function notePlaybackProgress(state: NonNullable<SpotifyPlayerSnapshot>) {
  const duration = typeof state.duration === "number" ? state.duration : cachedDurationMs;
  if (typeof state.duration === "number" && state.duration > 0) {
    cachedDurationMs = state.duration;
  }
  if (duration > 0 && state.position >= Math.max(0, duration - 5_000)) {
    approachedTrackEnd = true;
  }
}

function syncPlaybackPosition(state: SpotifyPlayerSnapshot) {
  const wasPlaying = cachedPlaying;

  if (!state) {
    cachedPlaying = false;
    stopPlaybackProgressWatch();
    onPlayingChange?.(false);
    if (wasPlaying && !withinPlaybackGrace()) schedulePlaybackEnded();
    return;
  }

  notePlaybackProgress(state);
  const playing = !state.paused;
  cachedPositionMs = state.position;
  cachedPositionAt = performance.now();

  if (playing) {
    // Near the end while still "playing": arm end — do NOT cancel pending end timers
    // (that race was dropping Hall DJ auto-next).
    if (isTrackFinished(state)) {
      cachedPlaying = true;
      onPlayingChange?.(true);
      // #region agent log
      dbgDj("A", "spotifyWebPlayback.ts:syncPlaybackPosition", "playing but finished — arm end", {
        position: state.position,
        duration: state.duration,
      });
      // #endregion
      schedulePlaybackEnded();
      return;
    }
    cancelSpotifyPlaybackEnded();
    cachedPlaying = true;
    onPlayingChange?.(true);
    startPlaybackProgressWatch();
    return;
  }

  // Early pause after start without playback_error yet — treat as DRM failure once.
  if (wasPlaying && withinPlaybackGrace() && state.position < 5_000 && !fullPlaybackDisabled) {
    handlePlaybackError("Early pause (likely DRM)");
    return;
  }

  cachedPlaying = false;
  stopPlaybackProgressWatch();
  onPlayingChange?.(false);
  if (!wasPlaying) return;
  const ended = shouldTreatAsTrackEnded(state);
  // #region agent log
  dbgDj("A", "spotifyWebPlayback.ts:syncPlaybackPosition", "paused after playing", {
    position: state.position,
    duration: state.duration,
    finished: isTrackFinished(state),
    ended,
    approachedTrackEnd,
    hasTrack: Boolean(state.track_window?.current_track),
    withinGrace: withinPlaybackGrace(),
  });
  // #endregion
  if (ended) {
    schedulePlaybackEnded();
  } else {
    scheduleEndConfirm();
  }
}

export function setSpotifyWebPlaybackListener(listener: PlayerStateListener | null) {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    void desktop.then((m) => m.setSpotifyWebPlaybackListener(listener));
    return;
  }
  onPlayingChange = listener;
}

export function setSpotifyWebPlaybackEndedListener(listener: PlaybackEndedListener | null) {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    void desktop.then((m) => m.setSpotifyWebPlaybackEndedListener(listener));
    return;
  }
  onPlaybackEnded = listener;
}

function loadSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    let settled = false;
    let poll: number | undefined;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (poll) window.clearInterval(poll);
      window.clearTimeout(sdkTimeout);
      fn();
    };
    const done = () => finish(resolve);
    window.onSpotifyWebPlaybackSDKReady = done;

    const sdkTimeout = window.setTimeout(() => {
      finish(() => reject(new Error("SDK Spotify indisponible.")));
    }, 10_000);

    if (window.Spotify?.Player) {
      done();
      return;
    }

    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      if (window.Spotify?.Player) {
        done();
        return;
      }
      poll = window.setInterval(() => {
        if (window.Spotify?.Player) {
          done();
        }
      }, 50);
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => finish(() => reject(new Error("Impossible de charger le SDK Spotify.")));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

function waitForDeviceId(timeoutMs = 6_000): Promise<string> {
  if (deviceId) return Promise.resolve(deviceId);
  if (!player) return Promise.reject(new Error("Lecteur Spotify non initialisé."));
  if (deviceReadyPromise) return deviceReadyPromise;

  deviceReadyPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      deviceReadyPromise = null;
      fn();
    };

    const onReady = ({ device_id }: { device_id: string }) => {
      deviceId = device_id;
      finish(() => resolve(device_id));
    };

    const poll = window.setInterval(() => {
      const id = deviceId;
      if (id) finish(() => resolve(id));
    }, 120);

    const timer = window.setTimeout(() => {
      finish(() => reject(new Error("Le lecteur Spotify met trop de temps à démarrer.")));
    }, timeoutMs);

    function cleanup() {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      try {
        player?.removeListener("ready");
      } catch {
        // ignore
      }
    }

    player!.addListener("ready", onReady);
    const existingId = deviceId;
    if (existingId) finish(() => resolve(existingId));
  });

  return deviceReadyPromise;
}

async function ensureDeviceReady(timeoutMs?: number): Promise<string | null> {
  if (deviceId) return deviceId;
  if (!player) return null;
  const budget = timeoutMs ?? (deviceId ? 1_500 : 6_000);
  try {
    return await waitForDeviceId(budget);
  } catch {
    try {
      const reconnected = await player.connect();
      if (!reconnected) return null;
      return await waitForDeviceId(Math.min(budget, 3_000));
    } catch {
      return null;
    }
  }
}

export async function ensureSpotifyWebPlayer(options?: { premiumHint?: boolean | null }): Promise<SpotifyWebPlayer | null> {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    const m = await desktop;
    await m.ensureSpotifyWebPlayer();
    return {} as SpotifyWebPlayer;
  }
  if (player) {
    if (!premiumAvailable) return null;
    return player;
  }
  if (options?.premiumHint === true) {
    premiumAvailable = true;
  }
  if (options?.premiumHint === false) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!premiumAvailable) {
        const config = await fetchSpotifyPlayerConfig();
        premiumAvailable = config.premium;
      }
      if (!premiumAvailable) return null;

      await loadSpotifySdk();
      if (!window.Spotify?.Player) {
        throw new Error("SDK Spotify indisponible.");
      }

      player = new window.Spotify.Player({
        name: "Hall Web Player",
        getOAuthToken: (callback) => {
          void resolveSpotifyPlayerAccessToken()
            .then((token) => callback(token))
            .catch(() => callback(""));
        },
        volume: 0.85,
      });

      player.addListener("ready", ({ device_id }) => {
        deviceId = device_id;
      });
      player.addListener("not_ready", ({ device_id }) => {
        if (!device_id || deviceId === device_id) deviceId = null;
      });
      player.addListener("player_state_changed", (state) => {
        syncPlaybackPosition(state);
      });
      player.addListener("authentication_error", ({ message }) => {
        console.warn("[spotify-web-playback] auth:", message);
      });
      player.addListener("account_error", ({ message }) => {
        console.warn("[spotify-web-playback] account:", message);
        premiumAvailable = false;
      });
      player.addListener("initialization_error", ({ message }) => {
        console.warn("[spotify-web-playback] init:", message);
      });
      player.addListener("playback_error", ({ message }) => {
        handlePlaybackError(message || "Playback error");
      });

      const connected = await player.connect();
      if (!connected) return null;
      // Device "ready" is resolved lazily in playSpotifyFullTrack — do not
      // block warm/init on it (Electron often needs 5-15 s for Widevine).
      void ensureDeviceReady().catch(() => undefined);
      return player;
    } catch (err) {
      console.warn("[spotify-web-playback] init failed", err);
      return null;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function isSpotifyPremiumAvailable(): boolean {
  if (hasSpotifyWebView2Desktop()) return true;
  return premiumAvailable;
}

export function primeSpotifyWebAudioUnlock(): void {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    void desktop.then((m) => m.primeSpotifyWebAudioUnlock());
    return;
  }
  if (player) void player.activateElement().catch(() => undefined);
}

/** Prépare le SDK + device en arrière-plan pour réduire le délai au premier ▶. */
export function warmSpotifyWebPlayer(premiumHint?: boolean | null): void {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    void desktop.then((m) => m.warmSpotifyWebPlayer(premiumHint));
    return;
  }
  if (premiumHint === false) return;
  void ensureSpotifyWebPlayer({ premiumHint });
}

export async function playSpotifyFullTrack(trackId: string): Promise<boolean> {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    const m = await desktop;
    return m.playSpotifyFullTrack(trackId);
  }
  if (fullPlaybackDisabled) {
    return false;
  }
  try {
    primeSpotifyWebAudioUnlock();
    const webPlayer = await ensureSpotifyWebPlayer();
    if (!webPlayer || !premiumAvailable) return false;

    try {
      await webPlayer.activateElement();
    } catch {
      // continue — play may still work
    }

    const activeDeviceId = await ensureDeviceReady();
    if (!activeDeviceId) return false;

    markPlaybackStarted(trackId);
    const ok = await putPlayOnDevice(trackId, activeDeviceId);
    if (ok) {
      try {
        await webPlayer.activateElement();
        await webPlayer.resume();
      } catch {
        // player_state_changed will sync shortly
      }
      try {
        const state = await webPlayer.getCurrentState();
        syncPlaybackPosition(state);
      } catch {
        // player_state_changed will sync shortly
      }
    }
    return ok;
  } catch (err) {
    console.warn("[spotify-web-playback] play failed", err);
    return false;
  }
}

export async function toggleSpotifyWebPlayback(): Promise<void> {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    const m = await desktop;
    await m.toggleSpotifyWebPlayback();
    return;
  }
  if (!player) return;
  await player.togglePlay();
}

export async function pauseSpotifyWebPlayback(): Promise<void> {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    const m = await desktop;
    await m.pauseSpotifyWebPlayback();
    return;
  }
  if (!player) return;
  await player.pause();
}

export async function resumeSpotifyWebPlayback(): Promise<void> {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    const m = await desktop;
    await m.resumeSpotifyWebPlayback();
    return;
  }
  if (!player) return;
  await player.resume();
}

export function resetSpotifyWebPlayer() {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    void desktop.then((m) => m.resetSpotifyWebPlayer());
    return;
  }
  cancelSpotifyPlaybackEnded();
  stopPlaybackProgressWatch();
  void player?.disconnect();
  player = null;
  deviceId = null;
  deviceReadyPromise = null;
  premiumAvailable = false;
  initPromise = null;
  cachedPlayerAccessToken = null;
  cachedPlayerAccessTokenAt = 0;
  cachedPositionMs = 0;
  cachedPositionAt = 0;
  cachedDurationMs = 0;
  cachedPlaying = false;
  playbackStartedAt = 0;
  lastPlayTrackId = null;
  approachedTrackEnd = false;
  // Keep fullPlaybackDisabled — DRM failure persists for the session.
}

function extrapolatedPositionSec(): number | null {
  if (cachedPositionAt <= 0) return null;
  if (!cachedPlaying) return cachedPositionMs / 1000;
  const sec = (cachedPositionMs + (performance.now() - cachedPositionAt)) / 1000;
  if (cachedDurationMs > 0) {
    const durationSec = cachedDurationMs / 1000;
    if (sec >= durationSec - 0.35) {
      // Timer was still advancing past the track — force the same end path as Next.
      dbgDj("D", "spotifyWebPlayback.ts:extrapolatedPosition", "past duration → end", {
        sec,
        durationSec,
      });
      schedulePlaybackEnded();
      return durationSec;
    }
  }
  return sec;
}

export function getSpotifyPlaybackPositionSecSync(): number | null {
  if (hasSpotifyWebView2Desktop()) return null;
  if (!player || !cachedPlaying || cachedPositionAt <= 0) return null;
  return extrapolatedPositionSec();
}

export async function getSpotifyPlaybackPositionSec(): Promise<number | null> {
  const desktop = loadDesktopPlayback();
  if (desktop) {
    const m = await desktop;
    return m.getSpotifyPlaybackPositionSec();
  }
  if (!player) return null;
  if (cachedPlaying && cachedPositionAt > 0) {
    return extrapolatedPositionSec();
  }
  try {
    const state = await player.getCurrentState();
    if (!state || typeof state.position !== "number") return null;
    cachedPositionMs = state.position;
    cachedPositionAt = performance.now();
    cachedPlaying = !state.paused;
    if (typeof state.duration === "number" && state.duration > 0) {
      cachedDurationMs = state.duration;
    }
    if (isTrackFinished(state) || nearCachedDuration(state.position)) {
      schedulePlaybackEnded();
    }
    return state.position / 1000;
  } catch {
    return cachedPositionAt > 0 ? cachedPositionMs / 1000 : null;
  }
}
