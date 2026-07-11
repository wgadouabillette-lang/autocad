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
    onPlayingChange?.(playing);
  });
  api.onSpotifyPlaybackEnded(() => {
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
    await desktop()?.playSpotifyWebView2?.(trackId);
    return true;
  } catch (err) {
    console.warn("[spotify-webview2] play failed", err);
    return false;
  }
}

export async function toggleSpotifyWebPlayback(): Promise<void> {
  if (!(await ensureBridge())) return;
  await desktop()?.toggleSpotifyWebView2?.();
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

export function getSpotifyPlaybackPositionSecSync(): number | null {
  return null;
}

export async function getSpotifyPlaybackPositionSec(): Promise<number | null> {
  return null;
}
