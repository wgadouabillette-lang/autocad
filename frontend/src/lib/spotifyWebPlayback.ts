import { fetchSpotifyPlayerConfig, fetchSpotifyPlayerToken } from "./connectorsApi";

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
  } | null>;
  addListener(event: "ready", callback: (data: { device_id: string }) => void): void;
  addListener(event: "not_ready", callback: (data: { device_id: string }) => void): void;
  addListener(
    event: "player_state_changed",
    callback: (state: { paused: boolean; position: number } | null) => void,
  ): void;
  addListener(event: "authentication_error", callback: (data: { message: string }) => void): void;
  addListener(event: "account_error", callback: (data: { message: string }) => void): void;
  addListener(event: "initialization_error", callback: (data: { message: string }) => void): void;
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
let cachedPlaying = false;
let playbackEndedTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelSpotifyPlaybackEnded() {
  if (playbackEndedTimer) {
    clearTimeout(playbackEndedTimer);
    playbackEndedTimer = null;
  }
}

function schedulePlaybackEnded() {
  cancelSpotifyPlaybackEnded();
  playbackEndedTimer = setTimeout(() => {
    playbackEndedTimer = null;
    onPlaybackEnded?.();
  }, 900);
}

function syncPlaybackPosition(state: { paused: boolean; position: number } | null) {
  if (!state) {
    const wasPlaying = cachedPlaying;
    cachedPlaying = false;
    onPlayingChange?.(false);
    if (wasPlaying) schedulePlaybackEnded();
    return;
  }
  cancelSpotifyPlaybackEnded();
  cachedPositionMs = state.position;
  cachedPositionAt = performance.now();
  cachedPlaying = !state.paused;
  onPlayingChange?.(cachedPlaying);
}

export function setSpotifyWebPlaybackListener(listener: PlayerStateListener | null) {
  onPlayingChange = listener;
}

export function setSpotifyWebPlaybackEndedListener(listener: PlaybackEndedListener | null) {
  onPlaybackEnded = listener;
}

function loadSpotifySdk(): Promise<void> {
  if (window.Spotify?.Player) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const finish = () => resolve();
    window.onSpotifyWebPlaybackSDKReady = finish;

    if (window.Spotify?.Player) {
      finish();
      return;
    }

    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      if (window.Spotify?.Player) {
        finish();
        return;
      }
      const poll = window.setInterval(() => {
        if (window.Spotify?.Player) {
          window.clearInterval(poll);
          finish();
        }
      }, 50);
      window.setTimeout(() => {
        window.clearInterval(poll);
        reject(new Error("SDK Spotify indisponible."));
      }, 10_000);
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => reject(new Error("Impossible de charger le SDK Spotify."));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

function waitForDeviceId(timeoutMs = 15_000): Promise<string> {
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

async function ensureDeviceReady(timeoutMs = 15_000): Promise<string | null> {
  if (deviceId) return deviceId;
  if (!player) return null;
  try {
    return await waitForDeviceId(timeoutMs);
  } catch {
    try {
      const reconnected = await player.connect();
      if (!reconnected) return null;
      return await waitForDeviceId(Math.min(timeoutMs, 8_000));
    } catch {
      return null;
    }
  }
}

export async function ensureSpotifyWebPlayer(options?: { premiumHint?: boolean | null }): Promise<SpotifyWebPlayer | null> {
  if (player) {
    if (!premiumAvailable) return null;
    await ensureDeviceReady();
    return player;
  }
  if (options?.premiumHint === false) return null;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const config = await fetchSpotifyPlayerConfig();
      premiumAvailable = config.premium;
      if (!config.premium) return null;

      await loadSpotifySdk();
      if (!window.Spotify?.Player) {
        throw new Error("SDK Spotify indisponible.");
      }

      player = new window.Spotify.Player({
        name: "Lyte Web Player",
        getOAuthToken: (callback) => {
          void fetchSpotifyPlayerToken()
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

      const connected = await player.connect();
      if (!connected) return null;
      await ensureDeviceReady();
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
  return premiumAvailable;
}

export function primeSpotifyWebAudioUnlock(): void {
  if (player) void player.activateElement().catch(() => undefined);
}

/** Prépare le SDK + device en arrière-plan pour réduire le délai au premier ▶. */
export function warmSpotifyWebPlayer(premiumHint?: boolean | null): void {
  if (premiumHint === false) return;
  void ensureSpotifyWebPlayer({ premiumHint });
}

export async function playSpotifyFullTrack(trackId: string): Promise<boolean> {
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

    const token = await fetchSpotifyPlayerToken();

    const play = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(activeDeviceId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
      },
    );

    const ok = play.ok || play.status === 204;
    if (ok) {
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
  if (!player) return;
  await player.togglePlay();
}

export async function pauseSpotifyWebPlayback(): Promise<void> {
  if (!player) return;
  await player.pause();
}

export async function resumeSpotifyWebPlayback(): Promise<void> {
  if (!player) return;
  await player.resume();
}

export function resetSpotifyWebPlayer() {
  void player?.disconnect();
  player = null;
  deviceId = null;
  deviceReadyPromise = null;
  premiumAvailable = false;
  initPromise = null;
  cachedPositionMs = 0;
  cachedPositionAt = 0;
  cachedPlaying = false;
}

export function getSpotifyPlaybackPositionSecSync(): number | null {
  if (!player || !cachedPlaying || cachedPositionAt <= 0) return null;
  return (cachedPositionMs + (performance.now() - cachedPositionAt)) / 1000;
}

export async function getSpotifyPlaybackPositionSec(): Promise<number | null> {
  if (!player) return null;
  if (cachedPlaying && cachedPositionAt > 0) {
    const elapsed = performance.now() - cachedPositionAt;
    return (cachedPositionMs + elapsed) / 1000;
  }
  try {
    const state = await player.getCurrentState();
    if (!state || typeof state.position !== "number") return null;
    cachedPositionMs = state.position;
    cachedPositionAt = performance.now();
    cachedPlaying = !state.paused;
    return state.position / 1000;
  } catch {
    return cachedPositionAt > 0 ? cachedPositionMs / 1000 : null;
  }
}
