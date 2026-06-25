import { fetchSpotifyBeatGrid } from "./connectorsApi";
import { getSpotifyPlaybackPositionSec, getSpotifyPlaybackPositionSecSync } from "./spotifyWebPlayback";
import { getSpotifyPreviewAudioElement } from "../store/useSpotifyPlayerStore";

type PulseListener = (level: number) => void;
type PlaybackMode = "preview" | "full" | null;

const beatCache = new Map<string, Float32Array>();
const tempoCache = new Map<string, number>();
const BEAT_WINDOW_SEC = 0.16;
const PULSE_ATTACK = 0.16;
const PULSE_RELEASE = 0.06;
const DEFAULT_BPM = 118;

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let streamSource: MediaStreamAudioSourceNode | null = null;
let connectedElement: HTMLMediaElement | null = null;

let rafId = 0;
let audioPollId = 0;
let statePollId = 0;
let listener: PulseListener | null = null;
let smoothedLevel = 0;
let cachedPositionSec = 0;
let beatTimes: Float32Array | null = null;
let activeMode: PlaybackMode = null;
let useBeatGrid = false;
let pulseBpm = DEFAULT_BPM;
let syntheticPhase = 0;
let lastTickAt = 0;

const freqData = new Uint8Array(512);
let prevBassEnergy = 0;

function shapePulseLevel(level: number): number {
  const t = Math.max(0, Math.min(1, level));
  return t * t * (3 - 2 * t);
}

function emitLevel(raw: number) {
  const target = Math.max(0, Math.min(1, raw));
  const rate = target > smoothedLevel ? PULSE_ATTACK : PULSE_RELEASE;
  smoothedLevel += (target - smoothedLevel) * rate;
  listener?.(shapePulseLevel(smoothedLevel));
}

function beatLevelAt(positionSec: number, beats: Float32Array): number {
  if (beats.length === 0) return 0;

  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid] <= positionSec) lo = mid;
    else hi = mid - 1;
  }

  let max = 0;
  for (let idx = lo - 1; idx <= lo + 1; idx += 1) {
    if (idx < 0 || idx >= beats.length) continue;
    const delta = Math.abs(positionSec - beats[idx]);
    if (delta >= BEAT_WINDOW_SEC) continue;
    const t = 1 - delta / BEAT_WINDOW_SEC;
    max = Math.max(max, t * t);
  }
  return max;
}

function syntheticBeatLevel(deltaSec: number): number {
  if (pulseBpm <= 0) return 0;
  syntheticPhase = (syntheticPhase + deltaSec * (pulseBpm / 60)) % 1;
  const dist = Math.min(syntheticPhase, 1 - syntheticPhase) * 2;
  return Math.pow(Math.max(0, 1 - dist / 0.22), 2);
}

function ensureContext(): AudioContext {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

/** Analyse only — never reroute element output (captureStream keeps native playback). */
export function primeSpotifyPreviewAudio(): void {
  const ctx = ensureContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function disconnectAnalyser() {
  try {
    streamSource?.disconnect();
  } catch {
    // ignore
  }
  streamSource = null;
  connectedElement = null;
  prevBassEnergy = 0;
}

function findPlayingAudioElement(): HTMLMediaElement | null {
  const preview = getSpotifyPreviewAudioElement();
  if (preview && !preview.paused && preview.currentTime > 0) return preview;
  for (const node of document.querySelectorAll("audio")) {
    const el = node as HTMLMediaElement;
    if (el === preview) continue;
    if (!el.paused && el.currentTime > 0) return el;
  }
  return null;
}

function connectAnalyser(el: HTMLMediaElement) {
  if (connectedElement === el && streamSource) return;

  const ctx = ensureContext();
  if (ctx.state === "suspended") void ctx.resume();

  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
  }

  try {
    streamSource?.disconnect();
  } catch {
    // ignore
  }
  streamSource = null;

  const captureStream = (el as HTMLMediaElement & { captureStream?: () => MediaStream }).captureStream;
  if (typeof captureStream !== "function") {
    connectedElement = null;
    return;
  }

  try {
    streamSource = ctx.createMediaStreamSource(captureStream.call(el));
    streamSource.connect(analyser);
    connectedElement = el;
  } catch {
    streamSource = null;
    connectedElement = null;
  }
}

function measureAudioLevel(): number {
  if (!analyser) return 0;
  analyser.getByteFrequencyData(freqData);
  let peak = 0;
  for (let i = 2; i <= 18; i += 1) {
    peak = Math.max(peak, freqData[i] ?? 0);
  }
  const bass = peak / 255;
  const flux = Math.max(0, bass - prevBassEnergy);
  prevBassEnergy = bass * 0.8;
  return Math.min(1, bass * 0.55 + flux * 3.5);
}

function pollAudioAnalyser() {
  const el = findPlayingAudioElement();
  if (!el) return;
  connectAnalyser(el);
}

async function refreshSdkPositionAsync() {
  const pos = await getSpotifyPlaybackPositionSec();
  if (pos != null) cachedPositionSec = pos;
}

function refreshSdkPosition() {
  const sync = getSpotifyPlaybackPositionSecSync();
  if (sync != null) {
    cachedPositionSec = sync;
    return;
  }
  void refreshSdkPositionAsync();
}

function refreshPreviewPosition() {
  cachedPositionSec = getSpotifyPreviewAudioElement()?.currentTime ?? 0;
}

function computeRawLevel(deltaSec: number): number {
  let level = 0;

  if (useBeatGrid && beatTimes && beatTimes.length > 0) {
    level = Math.max(level, beatLevelAt(cachedPositionSec, beatTimes));
  }

  if (analyser) {
    level = Math.max(level, measureAudioLevel());
  }

  if (level < 0.12) {
    level = Math.max(level, syntheticBeatLevel(deltaSec) * 0.38);
  }

  return level;
}

function tick(now: number) {
  if (!listener) return;

  const deltaSec = lastTickAt > 0 ? Math.min(0.05, (now - lastTickAt) / 1000) : 1 / 60;
  lastTickAt = now;

  if (activeMode === "full") {
    refreshSdkPosition();
  } else if (activeMode === "preview") {
    refreshPreviewPosition();
  }

  pollAudioAnalyser();
  emitLevel(computeRawLevel(deltaSec));
  rafId = requestAnimationFrame(tick);
}

async function loadBeatGrid(trackId: string) {
  const cached = beatCache.get(trackId);
  if (cached) {
    beatTimes = cached;
    useBeatGrid = cached.length > 0;
    pulseBpm = tempoCache.get(trackId) ?? DEFAULT_BPM;
    return;
  }

  try {
    const { beats, tempo } = await fetchSpotifyBeatGrid(trackId);
    const bpm = tempo && tempo > 0 ? tempo : DEFAULT_BPM;
    pulseBpm = bpm;
    tempoCache.set(trackId, bpm);

    let arr: Float32Array;
    if (beats.length > 0) {
      const sorted = beats.filter((b) => Number.isFinite(b)).sort((a, b) => a - b);
      arr = Float32Array.from(sorted);
    } else if (bpm > 0) {
      const interval = 60 / bpm;
      const generated: number[] = [];
      for (let t = 0; t < 600; t += interval) generated.push(t);
      arr = Float32Array.from(generated);
    } else {
      arr = new Float32Array(0);
    }
    beatCache.set(trackId, arr);
    beatTimes = arr;
    useBeatGrid = arr.length > 0;
  } catch {
    beatTimes = null;
    useBeatGrid = false;
    pulseBpm = DEFAULT_BPM;
  }
}

export function startSpotifyPulseMonitor(
  trackId: string,
  mode: PlaybackMode,
  onLevel: PulseListener,
): () => void {
  stopSpotifyPulseMonitor();
  listener = onLevel;
  smoothedLevel = 0;
  syntheticPhase = 0;
  lastTickAt = 0;
  cachedPositionSec = 0;
  beatTimes = null;
  useBeatGrid = false;
  pulseBpm = tempoCache.get(trackId) ?? DEFAULT_BPM;
  activeMode = mode;

  pollAudioAnalyser();
  audioPollId = window.setInterval(pollAudioAnalyser, 200);
  if (mode === "full") {
    refreshSdkPosition();
    statePollId = window.setInterval(refreshSdkPosition, 120);
  } else if (mode === "preview") {
    refreshPreviewPosition();
  }

  void loadBeatGrid(trackId);
  rafId = requestAnimationFrame(tick);

  return stopSpotifyPulseMonitor;
}

export function stopSpotifyPulseMonitor() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (audioPollId) {
    window.clearInterval(audioPollId);
    audioPollId = 0;
  }
  if (statePollId) {
    window.clearInterval(statePollId);
    statePollId = 0;
  }
  disconnectAnalyser();
  beatTimes = null;
  useBeatGrid = false;
  activeMode = null;
  syntheticPhase = 0;
  lastTickAt = 0;
  smoothedLevel = 0;
  listener?.(0);
  listener = null;
}
