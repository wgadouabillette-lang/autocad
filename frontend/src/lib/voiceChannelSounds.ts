type VoiceSoundKind =
  | "join"
  | "leave"
  | "mute"
  | "unmute"
  | "screenShareStart"
  | "screenShareStop";

interface PlayOptions {
  /** Son plus discret quand un autre participant rejoint ou quitte. */
  remote?: boolean;
}

let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedContext) sharedContext = new Ctx();
  void sharedContext.resume();
  return sharedContext;
}

function connectSoftChain(ctx: AudioContext) {
  const filter = ctx.createBiquadFilter();
  const master = ctx.createGain();
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  filter.Q.value = 0.4;
  master.gain.value = 0.85;
  filter.connect(master);
  master.connect(ctx.destination);
  return { filter, master };
}

function playSoftTone(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peakGain: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.045);
  gain.gain.linearRampToValueAtTime(peakGain * 0.55, start + duration * 0.55);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function playSoftGlide(
  ctx: AudioContext,
  destination: AudioNode,
  fromHz: number,
  toHz: number,
  start: number,
  duration: number,
  peakGain: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(fromHz, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(toHz, 1), start + duration * 0.72);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.05);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.04);
}

function playVoiceSound(kind: VoiceSoundKind, options: PlayOptions = {}) {
  const ctx = audioContext();
  if (!ctx) return;

  const { filter } = connectSoftChain(ctx);
  const localVol = 0.042;
  const remoteVol = 0.026;
  const uiVol = 0.034;
  const t = ctx.currentTime;

  if (kind === "join") {
    const volume = options.remote ? remoteVol : localVol;
    playSoftGlide(ctx, filter, 392, 466.16, t, 0.2, volume);
    playSoftGlide(ctx, filter, 466.16, 523.25, t + 0.11, 0.22, volume * 0.88);
    return;
  }

  if (kind === "leave") {
    const volume = options.remote ? remoteVol : localVol;
    playSoftGlide(ctx, filter, 523.25, 466.16, t, 0.2, volume * 0.9);
    playSoftGlide(ctx, filter, 466.16, 392, t + 0.11, 0.22, volume * 0.82);
    return;
  }

  if (kind === "mute") {
    playSoftGlide(ctx, filter, 440, 369.99, t, 0.14, uiVol);
    return;
  }

  if (kind === "unmute") {
    playSoftGlide(ctx, filter, 369.99, 440, t, 0.14, uiVol);
    return;
  }

  if (kind === "screenShareStart") {
    playSoftTone(ctx, filter, 493.88, t, 0.24, uiVol * 0.9);
    playSoftTone(ctx, filter, 587.33, t + 0.09, 0.28, uiVol * 0.72);
    return;
  }

  playSoftTone(ctx, filter, 415.3, t, 0.26, uiVol * 0.8);
}

export function playVoiceJoinSound(options?: PlayOptions) {
  playVoiceSound("join", options);
}

export function playVoiceLeaveSound(options?: PlayOptions) {
  playVoiceSound("leave", options);
}

export function playVoiceMuteSound() {
  playVoiceSound("mute");
}

export function playVoiceUnmuteSound() {
  playVoiceSound("unmute");
}

export function playScreenShareStartSound() {
  playVoiceSound("screenShareStart");
}

export function playScreenShareStopSound() {
  playVoiceSound("screenShareStop");
}
