import { fetchSpotifyPlayerToken } from "./connectorsApi";
import { hasSpotifyWebView2Desktop } from "./formaDesktop";

type PlayerStateListener = (playing: boolean) => void;
type PlaybackEndedListener = () => void;

let onPlayingChange: PlayerStateListener | null = null;
let onPlaybackEnded: PlaybackEndedListener | null = null;
let bridgeReady = false;
let bridgeInitPromise: Promise<boolean> | null = null;

function desktop() {
  return window.formaDesktop;
}

function ensureBridgeListeners() {
  if (bridgeReady || !hasSpotifyWebView2Desktop()) return;
  const api = desktop();
  if (!api?.onSpotifyTokenRequest || !api.onSpotifyPlaybackState || !api.onSpotifyPlaybackEnded) {
    return;
  }

  api.onSpotifyTokenRequest(async ({ id }) => {
    const token = await fetchSpotifyPlayerToken().catch(() => "");
    await api.respondSpotifyToken?.({ id, token });
  });
  api.onSpotifyPlaybackState(({ playing }) => {
    cachedPlaying = playing;
    if (!playing) cachedPositionAt = performance.now();
    onPlayingChange?.(playing);
  });
  api.onSpotifyPlaybackEnded(() => {
    cachedPlaying = false;
    if (cachedDurationSec > 0) cachedPositionSec = cachedDurationSec;
    cachedPositionAt = performance.now();
    onPlaybackEnded?.();
  });
  bridgeReady = true;
}

async function ensureBridge(): Promise<boolean> {
  if (!hasSpotifyWebView2Desktop()) return false;
  ensureBridgeListeners();
  const api = desktop();
  if (!api?.getSpotifyWebView2Availability) return false;
  if (bridgeInitPromise) return bridgeInitPromise;

  bridgeInitPromise = (async () => {
    try {
      const availability = await api.getSpotifyWebView2Availability?.();
      return availability?.supported === true;
    } catch {
      return false;
    } finally {
      bridgeInitPromise = null;
    }
  })();

  return bridgeInitPromise;
}

export function setSpotifyWebPlaybackListener(listener: PlayerStateListener | null) {
  onPlayingChange = listener;
}

export function setSpotifyWebPlaybackEndedListener(listener: PlaybackEndedListener | null) {
  onPlaybackEnded = listener;
}

export function cancelSpotifyPlaybackEnded() {
  // WebView2 host gère la fin de piste via événements.
}

export function primeSpotifyWebAudioUnlock(): void {
  // Audio joué dans WebView2 — pas d'unlock nécessaire côté UI.
}

export function warmSpotifyWebPlayer(_premiumHint?: boolean | null): void {
  void (async () => {
    if (!(await ensureBridge())) return;
    await desktop()?.warmSpotifyWebView2?.();
  })();
}

export async function ensureSpotifyWebPlayer(): Promise<unknown | null> {
  if (!(await ensureBridge())) return null;
  await desktop()?.warmSpotifyWebView2?.();
  return {};
}

export function isSpotifyPremiumAvailable(): boolean {
  return true;
}

export async function playSpotifyFullTrack(trackId: string): Promise<boolean> {
  if (!(await ensureBridge())) return false;
  try {
    cachedPositionSec = 0;
    cachedPositionAt = performance.now();
    cachedDurationSec = 0;
    cachedPlaying = true;
    await desktop()?.playSpotifyWebView2?.(trackId);
    return true;
  } catch (err) {
    console.warn("[spotify-webview2] play failed", err);
    cachedPlaying = false;
    return false;
  }
}

export async function toggleSpotifyWebPlayback(): Promise<void> {
  if (!(await ensureBridge())) return;
  await desktop()?.toggleSpotifyWebView2?.();
}

export async function setSpotifyPlaybackVolume(volume: number): Promise<void> {
  if (!(await ensureBridge())) return;
  const next =
    typeof volume === "number" && Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : 0.85;
  await desktop()?.setSpotifyWebView2Volume?.(next);
}

export async function pauseSpotifyWebPlayback(): Promise<void> {
  if (!(await ensureBridge())) return;
  await desktop()?.pauseSpotifyWebView2?.();
}

export async function resumeSpotifyWebPlayback(): Promise<void> {
  if (!(await ensureBridge())) return;
  await desktop()?.resumeSpotifyWebView2?.();
}

export function resetSpotifyWebPlayer() {
  void desktop()?.resetSpotifyWebView2?.();
}

let cachedPositionSec = 0;
let cachedPositionAt = 0;
let cachedDurationSec = 0;
let cachedPlaying = false;

export function getSpotifyPlaybackPositionSecSync(): number | null {
  if (cachedPositionAt <= 0) return null;
  if (!cachedPlaying) return cachedPositionSec;
  const sec = cachedPositionSec + (performance.now() - cachedPositionAt) / 1000;
  if (cachedDurationSec > 0) return Math.min(sec, cachedDurationSec);
  return sec;
}

export function getSpotifyPlaybackDurationSecSync(): number | null {
  return cachedDurationSec > 0 ? cachedDurationSec : null;
}

export async function getSpotifyPlaybackPositionSec(): Promise<number | null> {
  if (!(await ensureBridge())) return getSpotifyPlaybackPositionSecSync();
  try {
    const clock = await desktop()?.getSpotifyWebView2PlaybackClock?.();
    if (!clock) return getSpotifyPlaybackPositionSecSync();
    if (typeof clock.durationSec === "number" && clock.durationSec > 0) {
      cachedDurationSec = clock.durationSec;
    }
    if (typeof clock.sec === "number" && Number.isFinite(clock.sec)) {
      cachedPositionSec = Math.max(0, clock.sec);
      cachedPositionAt = performance.now();
      cachedPlaying = true;
      return cachedPositionSec;
    }
  } catch {
    // fall through to cached extrapolation
  }
  return getSpotifyPlaybackPositionSecSync();
}
