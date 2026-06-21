import { fetchSpotifyPlayerConfig, fetchSpotifyPlayerToken } from "./connectorsApi";

type SpotifyWebPlayer = {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  activateElement(): Promise<void>;
  addListener(event: "ready", callback: (data: { device_id: string }) => void): void;
  addListener(event: "not_ready", callback: (data: { device_id: string }) => void): void;
  addListener(
    event: "player_state_changed",
    callback: (state: { paused: boolean } | null) => void,
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

type PlayerStateListener = (playing: boolean) => void;
let onPlayingChange: PlayerStateListener | null = null;

export function setSpotifyWebPlaybackListener(listener: PlayerStateListener | null) {
  onPlayingChange = listener;
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
    if (existing) return;

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => reject(new Error("Impossible de charger le SDK Spotify."));
    document.body.appendChild(script);
  });

  return sdkPromise;
}

function waitForDeviceId(timeoutMs = 10_000): Promise<string> {
  if (deviceId) return Promise.resolve(deviceId);
  if (!player) return Promise.reject(new Error("Lecteur Spotify non initialisé."));

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Le lecteur Spotify met trop de temps à démarrer."));
    }, timeoutMs);

    player!.addListener("ready", ({ device_id }) => {
      window.clearTimeout(timer);
      deviceId = device_id;
      resolve(device_id);
    });
  });
}

export async function ensureSpotifyWebPlayer(): Promise<SpotifyWebPlayer | null> {
  if (player) return premiumAvailable ? player : null;
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
      player.addListener("not_ready", () => {
        deviceId = null;
      });
      player.addListener("player_state_changed", (state) => {
        onPlayingChange?.(state ? !state.paused : false);
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

export async function playSpotifyFullTrack(trackId: string): Promise<boolean> {
  const webPlayer = await ensureSpotifyWebPlayer();
  if (!webPlayer || !premiumAvailable) return false;

  await webPlayer.activateElement();
  const activeDeviceId = await waitForDeviceId();
  const token = await fetchSpotifyPlayerToken();

  const transfer = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_ids: [activeDeviceId], play: false }),
  });
  if (!transfer.ok && transfer.status !== 204) {
    return false;
  }

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

  return play.ok || play.status === 204;
}

export async function toggleSpotifyWebPlayback(): Promise<void> {
  if (!player) return;
  await player.togglePlay();
}

export async function pauseSpotifyWebPlayback(): Promise<void> {
  if (!player) return;
  await player.pause();
}

export function resetSpotifyWebPlayer() {
  void player?.disconnect();
  player = null;
  deviceId = null;
  premiumAvailable = false;
  initPromise = null;
}
